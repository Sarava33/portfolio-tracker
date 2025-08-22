import axios from 'axios'

// Mock prices as fallback when API fails
const MOCK_PRICES = {
  'AAPL': 182.63, 'GOOGL': 141.80, 'MSFT': 378.85, 'AMZN': 155.33,
  'TSLA': 202.64, 'META': 345.21, 'NVDA': 495.22, 'JPM': 151.24,
  'V': 250.87, 'JNJ': 160.11, 'WMT': 163.42, 'PG': 152.18,
  'UNH': 524.66, 'HD': 346.28, 'MA': 405.45, 'DIS': 97.28,
  'BAC': 33.92, 'NFLX': 445.73, 'ADBE': 538.90, 'CRM': 255.72
}

export default async function handler(req, res) {
  const { symbols } = req.query
  const apiKey = process.env.FINNHUB_API_KEY
  
  if (!symbols) {
    return res.status(400).json({ error: 'Symbols parameter required' })
  }

  const symbolList = symbols.split(',').map(s => s.trim().toUpperCase())
  const prices = {}

  // Check if API key exists
  if (!apiKey) {
    console.warn('⚠️  No Finnhub API key found in environment variables')
    console.warn('📝 Add FINNHUB_API_KEY to your .env.local file')
    
    // Return mock data with small variations
    symbolList.forEach(symbol => {
      const basePrice = MOCK_PRICES[symbol] || (50 + Math.random() * 450)
      const variation = (Math.random() - 0.5) * 0.02 // ±1% variation
      prices[symbol] = Number((basePrice * (1 + variation)).toFixed(2))
    })
    
    return res.status(200).json({
      ...prices,
      _source: 'mock_data',
      _note: 'Using mock data - add FINNHUB_API_KEY to .env.local for real prices'
    })
  }

  console.log(`🔍 Fetching real-time prices for: ${symbolList.join(', ')}`)

  try {
    // Fetch prices for all symbols concurrently
    const pricePromises = symbolList.map(async (symbol) => {
      try {
        console.log(`📊 Fetching ${symbol}...`)
        
        const response = await axios.get('https://finnhub.io/api/v1/quote', {
          params: {
            symbol: symbol,
            token: apiKey
          },
          timeout: 10000 // 10 second timeout
        })

        const data = response.data
        
        // Finnhub returns: c = current price, h = high, l = low, o = open, pc = previous close
        if (data.c && data.c > 0) {
          console.log(`✅ ${symbol}: $${data.c}`)
          return {
            symbol,
            price: Number(data.c.toFixed(2)),
            change: data.c - data.pc,
            changePercent: ((data.c - data.pc) / data.pc * 100),
            high: data.h,
            low: data.l,
            open: data.o,
            previousClose: data.pc
          }
        } else {
          console.warn(`⚠️  ${symbol}: No valid price data received`)
          return {
            symbol,
            price: MOCK_PRICES[symbol] || 100,
            _fallback: true
          }
        }
      } catch (error) {
        console.error(`❌ Error fetching ${symbol}:`, error.message)
        return {
          symbol,
          price: MOCK_PRICES[symbol] || 100,
          _error: error.message
        }
      }
    })

    const results = await Promise.all(pricePromises)
    
    // Build response object
    const response = {
      _source: 'finnhub',
      _timestamp: new Date().toISOString(),
      _symbols_requested: symbolList.length,
      _api_calls_made: results.length
    }
    
    results.forEach(result => {
      prices[result.symbol] = result.price
      
      // Add extra data for debugging (optional)
      if (result.change !== undefined) {
        response[`${result.symbol}_details`] = {
          price: result.price,
          change: Number(result.change.toFixed(2)),
          changePercent: Number(result.changePercent.toFixed(2)),
          high: result.high,
          low: result.low
        }
      }
    })

    console.log(`✅ Successfully fetched ${results.length} prices`)
    
    res.status(200).json({ ...prices, ...response })

  } catch (error) {
    console.error('❌ Fatal error in price fetching:', error)
    
    // Complete fallback to mock data
    symbolList.forEach(symbol => {
      const basePrice = MOCK_PRICES[symbol] || (50 + Math.random() * 450)
      prices[symbol] = Number(basePrice.toFixed(2))
    })
    
    res.status(200).json({
      ...prices,
      _source: 'mock_fallback',
      _error: 'API request failed, using fallback data'
    })
  }
}