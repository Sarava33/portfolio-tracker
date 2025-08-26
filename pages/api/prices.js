import axios from 'axios'

// Helper to format symbols for Yahoo Finance
const formatSymbolForYahoo = (symbol) => {
  const upperSymbol = symbol.toUpperCase().trim()
  
  // If already has exchange suffix, use as is
  if (upperSymbol.includes('.NS') || upperSymbol.includes('.BO')) {
    return upperSymbol
  }
  
  // Common Indian stocks - add .NS suffix
  const commonIndianStocks = [
    'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'ITC',
    'HINDUNILVR', 'BHARTIARTL', 'KOTAKBANK', 'LT', 'WIPRO', 'ADANIPORTS',
    'ASIANPAINT', 'AXISBANK', 'BAJFINANCE', 'MARUTI', 'SUNPHARMA', 'TATASTEEL'
  ]
  
  if (commonIndianStocks.includes(upperSymbol)) {
    return `${upperSymbol}.NS`
  }
  
  // Default to US stock (no suffix needed)
  return upperSymbol
}

// Detect currency based on symbol
const detectCurrency = (symbol) => {
  if (symbol.includes('.NS') || symbol.includes('.BO')) {
    return 'INR'
  }
  return 'USD'
}

export default async function handler(req, res) {
  const { symbols } = req.query
  
  if (!symbols) {
    return res.status(400).json({ error: 'Symbols parameter required' })
  }

  const symbolList = symbols.split(',').map(s => s.trim())
  const prices = {}

  console.log(`Fetching prices for: ${symbolList.join(', ')}`)

  try {
    // Process each symbol individually for better error handling
    const pricePromises = symbolList.map(async (originalSymbol) => {
      try {
        const yahooSymbol = formatSymbolForYahoo(originalSymbol)
        const currency = detectCurrency(yahooSymbol)
        
        console.log(`Fetching ${originalSymbol} -> ${yahooSymbol} (${currency})`)
        
        // Yahoo Finance API endpoint
        const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`, {
          params: {
            range: '1d',
            interval: '5m',
            includePrePost: 'true'
          },
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        })

        const data = response.data

        if (data?.chart?.result?.[0]?.meta?.regularMarketPrice) {
          const price = data.chart.result[0].meta.regularMarketPrice
          const previousClose = data.chart.result[0].meta.previousClose
          const change = price - previousClose
          const changePercent = (change / previousClose) * 100

          const currencySymbol = currency === 'INR' ? '₹' : '$'
          console.log(`✅ ${originalSymbol}: ${currencySymbol}${price.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(2)})`)

          return {
            symbol: originalSymbol,
            success: true,
            data: {
              price: Number(price.toFixed(2)),
              currency: currency,
              change: Number(change.toFixed(2)),
              changePercent: Number(changePercent.toFixed(2))
            }
          }
        } else {
          console.warn(`❌ ${originalSymbol}: No price data found`)
          return {
            symbol: originalSymbol,
            success: false,
            error: 'No price data available'
          }
        }

      } catch (error) {
        console.error(`❌ ${originalSymbol}: ${error.message}`)
        return {
          symbol: originalSymbol,
          success: false,
          error: error.message
        }
      }
    })

    const results = await Promise.all(pricePromises)
    
    // Process results
    const successCount = results.filter(r => r.success).length
    const errorCount = results.length - successCount

    results.forEach(result => {
      if (result.success) {
        prices[result.symbol] = result.data
      }
    })

    console.log(`✅ Successfully fetched ${successCount} prices, ${errorCount} failures`)

    if (successCount === 0) {
      return res.status(500).json({
        error: 'No price data could be retrieved',
        attempted_symbols: symbolList,
        errors: results.filter(r => !r.success).map(r => `${r.symbol}: ${r.error}`)
      })
    }

    return res.status(200).json({
      ...prices,
      _metadata: {
        timestamp: new Date().toISOString(),
        source: 'yahoo_finance',
        success_count: successCount,
        error_count: errorCount,
        total_requested: symbolList.length
      }
    })

  } catch (error) {
    console.error('Fatal error in Yahoo Finance API:', error.message)
    
    return res.status(500).json({
      error: 'Failed to fetch stock prices',
      message: error.message,
      attempted_symbols: symbolList
    })
  }
}