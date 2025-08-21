const mainApp = `import { useState, useEffect } from 'react'
import Head from 'next/head'
import Script from 'next/script'
import dynamic from 'next/dynamic'

// Dynamically import Recharts to avoid SSR issues
const PieChart = dynamic(() => import('recharts').then(mod => mod.PieChart), { ssr: false })
const Pie = dynamic(() => import('recharts').then(mod => mod.Pie), { ssr: false })
const Cell = dynamic(() => import('recharts').then(mod => mod.Cell), { ssr: false })
const BarChart = dynamic(() => import('recharts').then(mod => mod.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then(mod => mod.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(mod => mod.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(mod => mod.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(mod => mod.Tooltip), { ssr: false })

export default function Home() {
  const [holdings, setHoldings] = useState([])
  const [transactions, setTransactions] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSellModal, setShowSellModal] = useState(false)
  const [currentTab, setCurrentTab] = useState('holdings')
  const [editingStock, setEditingStock] = useState(null)
  const [sellingStock, setSellingStock] = useState(null)
  const [formData, setFormData] = useState({
    symbol: '',
    quantity: '',
    buyPrice: '',
    buyDate: new Date().toISOString().split('T')[0],
    commission: '0.5',
    tax: '15',
    serviceCharge: '0',
    notes: ''
  })
  const [sellData, setSellData] = useState({
    quantity: '',
    sellPrice: ''
  })

  // Load data on mount
  useEffect(() => {
    loadHoldings()
    loadTransactions()
    const interval = setInterval(() => {
      updatePrices()
    }, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [])

  const loadHoldings = async () => {
    try {
      const response = await fetch('/api/stocks', {
        headers: { 'user-id': getUserId() }
      })
      const data = await response.json()
      
      // Add current prices
      if (data.length > 0) {
        const symbols = data.map(s => s.symbol).join(',')
        const pricesResponse = await fetch(\`/api/prices?symbols=\${symbols}\`)
        const prices = await pricesResponse.json()
        
        const holdingsWithPrices = data.map(stock => ({
          ...stock,
          currentPrice: prices[stock.symbol] || stock.buy_price
        }))
        setHoldings(holdingsWithPrices)
      } else {
        setHoldings([])
      }
    } catch (error) {
      console.error('Error loading holdings:', error)
      // Use local storage as fallback
      const saved = localStorage.getItem('portfolio_holdings')
      if (saved) setHoldings(JSON.parse(saved))
    }
  }

  const loadTransactions = () => {
    const saved = localStorage.getItem('portfolio_transactions')
    if (saved) setTransactions(JSON.parse(saved))
  }

  const getUserId = () => {
    let userId = localStorage.getItem('user_id')
    if (!userId) {
      userId = 'user_' + Math.random().toString(36).substr(2, 9)
      localStorage.setItem('user_id', userId)
    }
    return userId
  }

  const updatePrices = async () => {
    if (holdings.length === 0) return
    
    const symbols = holdings.map(s => s.symbol).join(',')
    try {
      const response = await fetch(\`/api/prices?symbols=\${symbols}\`)
      const prices = await response.json()
      
      setHoldings(prev => prev.map(stock => ({
        ...stock,
        currentPrice: prices[stock.symbol] || stock.currentPrice
      })))
    } catch (error) {
      console.error('Error updating prices:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    const stockData = {
      symbol: formData.symbol.toUpperCase(),
      quantity: parseFloat(formData.quantity),
      buy_price: parseFloat(formData.buyPrice),
      buy_date: formData.buyDate,
      commission: parseFloat(formData.commission),
      tax: parseFloat(formData.tax),
      service_charge: parseFloat(formData.serviceCharge),
      notes: formData.notes
    }

    try {
      if (editingStock) {
        // Update existing stock
        await fetch('/api/stocks', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'user-id': getUserId()
          },
          body: JSON.stringify({ id: editingStock.id, ...stockData })
        })
      } else {
        // Add new stock
        await fetch('/api/stocks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'user-id': getUserId()
          },
          body: JSON.stringify(stockData)
        })
        
        // Add to transactions
        const newTransaction = {
          id: Date.now().toString(),
          date: formData.buyDate,
          type: 'BUY',
          symbol: formData.symbol.toUpperCase(),
          quantity: parseFloat(formData.quantity),
          price: parseFloat(formData.buyPrice),
          commission: parseFloat(formData.commission),
          notes: formData.notes
        }
        const updatedTransactions = [newTransaction, ...transactions]
        setTransactions(updatedTransactions)
        localStorage.setItem('portfolio_transactions', JSON.stringify(updatedTransactions))
      }

      await loadHoldings()
      setShowAddModal(false)
      resetForm()
    } catch (error) {
      console.error('Error saving stock:', error)
      alert('Error saving stock. Using local storage as fallback.')
      
      // Fallback to local storage
      const newStock = {
        id: editingStock?.id || Date.now().toString(),
        ...stockData,
        currentPrice: stockData.buy_price
      }
      
      let updatedHoldings
      if (editingStock) {
        updatedHoldings = holdings.map(h => h.id === editingStock.id ? newStock : h)
      } else {
        updatedHoldings = [...holdings, newStock]
      }
      
      setHoldings(updatedHoldings)
      localStorage.setItem('portfolio_holdings', JSON.stringify(updatedHoldings))
      setShowAddModal(false)
      resetForm()
    }
  }

  const handleSell = async (e) => {
    e.preventDefault()
    
    const sellQuantity = parseFloat(sellData.quantity)
    const sellPrice = parseFloat(sellData.sellPrice)
    
    if (sellQuantity > sellingStock.quantity) {
      alert('Cannot sell more than you own!')
      return
    }

    // Add sell transaction
    const newTransaction = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      type: 'SELL',
      symbol: sellingStock.symbol,
      quantity: sellQuantity,
      price: sellPrice,
      commission: sellingStock.commission,
      notes: \`Sold from position bought on \${sellingStock.buy_date}\`
    }
    
    const updatedTransactions = [newTransaction, ...transactions]
    setTransactions(updatedTransactions)
    localStorage.setItem('portfolio_transactions', JSON.stringify(updatedTransactions))

    // Update or remove holding
    let updatedHoldings
    if (sellQuantity >= sellingStock.quantity) {
      // Remove completely
      updatedHoldings = holdings.filter(h => h.id !== sellingStock.id)
    } else {
      // Reduce quantity
      updatedHoldings = holdings.map(h => 
        h.id === sellingStock.id 
          ? { ...h, quantity: h.quantity - sellQuantity }
          : h
      )
    }
    
    setHoldings(updatedHoldings)
    localStorage.setItem('portfolio_holdings', JSON.stringify(updatedHoldings))
    
    setShowSellModal(false)
    setSellData({ quantity: '', sellPrice: '' })
  }

  const deleteStock = async (id) => {
    if (!confirm('Are you sure you want to delete this stock?')) return
    
    try {
      await fetch(\`/api/stocks?id=\${id}\`, {
        method: 'DELETE',
        headers: { 'user-id': getUserId() }
      })
      await loadHoldings()
    } catch (error) {
      // Fallback to local storage
      const updatedHoldings = holdings.filter(h => h.id !== id)
      setHoldings(updatedHoldings)
      localStorage.setItem('portfolio_holdings', JSON.stringify(updatedHoldings))
    }
  }

  const resetForm = () => {
    setFormData({
      symbol: '',
      quantity: '',
      buyPrice: '',
      buyDate: new Date().toISOString().split('T')[0],
      commission: '0.5',
      tax: '15',
      serviceCharge: '0',
      notes: ''
    })
    setEditingStock(null)
  }

  const openEditModal = (stock) => {
    setEditingStock(stock)
    setFormData({
      symbol: stock.symbol,
      quantity: stock.quantity.toString(),
      buyPrice: stock.buy_price.toString(),
      buyDate: stock.buy_date,
      commission: stock.commission.toString(),
      tax: stock.tax.toString(),
      serviceCharge: stock.service_charge.toString(),
      notes: stock.notes || ''
    })
    setShowAddModal(true)
  }

  const openSellModal = (stock) => {
    setSellingStock(stock)
    setSellData({
      quantity: stock.quantity.toString(),
      sellPrice: stock.currentPrice.toFixed(2)
    })
    setShowSellModal(true)
  }

  // Calculations
  const calculatePL = (holding) => {
    const buyValue = holding.quantity * holding.buy_price
    const currentValue = holding.quantity * holding.currentPrice
    const buyCommission = buyValue * (holding.commission / 100)
    const buyTotal = buyValue + buyCommission + (holding.service_charge || 0)
    
    const pl = currentValue - buyTotal
    const plPercent = (pl / buyTotal) * 100
    
    return { pl, plPercent, buyTotal, currentValue }
  }

  const calculateHoldingPeriod = (buyDate) => {
    const buy = new Date(buyDate)
    const now = new Date()
    const days = Math.floor((now - buy) / (1000 * 60 * 60 * 24))
    const months = Math.floor(days / 30)
    const years = Math.floor(days / 365)
    
    if (years > 0) return \`\${years}y \${months % 12}m\`
    if (months > 0) return \`\${months}m \${days % 30}d\`
    return \`\${days}d\`
  }

  const isLongTerm = (buyDate) => {
    const buy = new Date(buyDate)
    const now = new Date()
    const days = Math.floor((now - buy) / (1000 * 60 * 60 * 24))
    return days >= 365
  }

  // Summary calculations
  const summary = holdings.reduce((acc, holding) => {
    const calc = calculatePL(holding)
    acc.totalInvested += calc.buyTotal
    acc.currentValue += calc.currentValue
    acc.totalPL += calc.pl
    acc.longTermCount += isLongTerm(holding.buy_date) ? 1 : 0
    acc.shortTermCount += isLongTerm(holding.buy_date) ? 0 : 1
    return acc
  }, { totalInvested: 0, currentValue: 0, totalPL: 0, longTermCount: 0, shortTermCount: 0 })

  summary.totalPLPercent = summary.totalInvested > 0 ? (summary.totalPL / summary.totalInvested) * 100 : 0

  // Chart data
  const pieChartData = holdings.map(h => ({
    name: h.symbol,
    value: h.quantity * h.currentPrice
  }))

  const barChartData = holdings.map(h => {
    const calc = calculatePL(h)
    return {
      name: h.symbol,
      value: calc.plPercent
    }
  })

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316']

  return (
    <>
      <Head>
        <title>Portfolio Tracker</title>
        <meta name="description" content="Track your stock portfolio" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      
      <Script src="https://cdn.tailwindcss.com" />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl p-6 mb-8">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Portfolio Tracker
                </h1>
                <p className="text-gray-600 mt-2">Track your investments in real-time</p>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={updatePrices}
                  className="px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all"
                >
                  🔄 Refresh Prices
                </button>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all"
                >
                  ➕ Add Stock
                </button>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white/95 backdrop-blur rounded-xl p-6 shadow-lg">
              <h3 className="text-sm font-semibold text-gray-600 uppercase">Total Invested</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                $\{summary.totalInvested.toFixed(2)}
              </p>
            </div>
            <div className="bg-white/95 backdrop-blur rounded-xl p-6 shadow-lg">
              <h3 className="text-sm font-semibold text-gray-600 uppercase">Current Value</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                $\{summary.currentValue.toFixed(2)}
              </p>
            </div>
            <div className="bg-white/95 backdrop-blur rounded-xl p-6 shadow-lg">
              <h3 className="text-sm font-semibold text-gray-600 uppercase">Total Returns</h3>
              <p className={\`text-3xl font-bold mt-2 \${summary.totalPL >= 0 ? 'text-green-600' : 'text-red-600'}\`}>
                \{summary.totalPL >= 0 ? '+' : ''}$\{Math.abs(summary.totalPL).toFixed(2)}
              </p>
              <p className={\`text-sm font-semibold mt-1 \${summary.totalPLPercent >= 0 ? 'text-green-600' : 'text-red-600'}\`}>
                \{summary.totalPLPercent >= 0 ? '+' : ''}\{summary.totalPLPercent.toFixed(2)}%
              </p>
            </div>
            <div className="bg-white/95 backdrop-blur rounded-xl p-6 shadow-lg">
              <h3 className="text-sm font-semibold text-gray-600 uppercase">Holdings</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">\{holdings.length}</p>
              <p className="text-xs text-gray-500 mt-1">
                \{summary.longTermCount} LTCG, \{summary.shortTermCount} STCG
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl">
            <div className="flex border-b">
              <button
                onClick={() => setCurrentTab('holdings')}
                className={\`px-6 py-3 font-semibold transition-all \${
                  currentTab === 'holdings' 
                    ? 'border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:text-gray-900'
                }\`}
              >
                Holdings
              </button>
              <button
                onClick={() => setCurrentTab('transactions')}
                className={\`px-6 py-3 font-semibold transition-all \${
                  currentTab === 'transactions' 
                    ? 'border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:text-gray-900'
                }\`}
              >
                Transactions
              </button>
              <button
                onClick={() => setCurrentTab('analytics')}
                className={\`px-6 py-3 font-semibold transition-all \${
                  currentTab === 'analytics' 
                    ? 'border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:text-gray-900'
                }\`}
              >
                Analytics
              </button>
            </div>

            <div className="p-6">
              {/* Holdings Tab */}
              {currentTab === 'holdings' && (
                <div className="overflow-x-auto">
                  {holdings.length === 0 ? (
                    <p className="text-center py-8 text-gray-500">
                      No holdings yet. Click "Add Stock" to get started.
                    </p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4">Symbol</th>
                          <th className="text-left py-3 px-4">Qty</th>
                          <th className="text-left py-3 px-4">Buy Price</th>
                          <th className="text-left py-3 px-4">Current</th>
                          <th className="text-left py-3 px-4">Period</th>
                          <th className="text-left py-3 px-4">P&L</th>
                          <th className="text-left py-3 px-4">P&L %</th>
                          <th className="text-left py-3 px-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {holdings.map(holding => {
                          const calc = calculatePL(holding)
                          const period = calculateHoldingPeriod(holding.buy_date)
                          const ltcg = isLongTerm(holding.buy_date)
                          
                          return (
                            <tr key={holding.id} className="border-b hover:bg-gray-50">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">\{holding.symbol}</span>
                                  {ltcg && (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                      LTCG
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4">\{holding.quantity}</td>
                              <td className="py-3 px-4">$\{holding.buy_price.toFixed(2)}</td>
                              <td className="py-3 px-4">
                                <span className={\`font-semibold \${
                                  holding.currentPrice > holding.buy_price ? 'text-green-600' : 'text-red-600'
                                }\`}>
                                  $\{holding.currentPrice.toFixed(2)}
                                </span>
                              </td>
                              <td className="py-3 px-4">\{period}</td>
                              <td className="py-3 px-4">
                                <span className={\`font-semibold \${
                                  calc.pl >= 0 ? 'text-green-600' : 'text-red-600'
                                }\`}>
                                  \{calc.pl >= 0 ? '+' : ''}$\{Math.abs(calc.pl).toFixed(2)}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <span className={\`font-semibold \${
                                  calc.plPercent >= 0 ? 'text-green-600' : 'text-red-600'
                                }\`}>
                                  \{calc.plPercent >= 0 ? '+' : ''}\{calc.plPercent.toFixed(2)}%
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => openEditModal(holding)}
                                    className="text-blue-600 hover:text-blue-800"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => openSellModal(holding)}
                                    className="text-green-600 hover:text-green-800"
                                  >
                                    💰
                                  </button>
                                  <button
                                    onClick={() => deleteStock(holding.id)}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Transactions Tab */}
              {currentTab === 'transactions' && (
                <div className="overflow-x-auto">
                  {transactions.length === 0 ? (
                    <p className="text-center py-8 text-gray-500">No transactions yet.</p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-4">Date</th>
                          <th className="text-left py-3 px-4">Type</th>
                          <th className="text-left py-3 px-4">Symbol</th>
                          <th className="text-left py-3 px-4">Quantity</th>
                          <th className="text-left py-3 px-4">Price</th>
                          <th className="text-left py-3 px-4">Total</th>
                          <th className="text-left py-3 px-4">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map(tx => (
                          <tr key={tx.id} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4">{tx.date}</td>
                            <td className="py-3 px-4">
                              <span className={\`px-2 py-1 rounded text-sm font-semibold \${
                                tx.type === 'BUY' 
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-red-100 text-red-700'
                              }\`}>
                                {tx.type}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-semibold">{tx.symbol}</td>
                            <td className="py-3 px-4">{tx.quantity}</td>
                            <td className="py-3 px-4">\${tx.price.toFixed(2)}</td>
                            <td className="py-3 px-4 font-semibold">
                              \${(tx.quantity * tx.price).toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-sm text-gray-600">
                              {tx.notes || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Analytics Tab */}
              {currentTab === 'analytics' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {holdings.length > 0 && (
                      <>
                        <div className="bg-gray-50 rounded-xl p-6">
                          <h3 className="text-lg font-semibold mb-4">Portfolio Distribution</h3>
                          <PieChart width={400} height={300}>
                            <Pie
                              data={pieChartData}
                              cx={200}
                              cy={150}
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                              label={(entry) => entry.name}
                            >
                              {pieChartData.map((entry, index) => (
                                <Cell key={\`cell-\${index}\`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </div>
                        
                        <div className="bg-gray-50 rounded-xl p-6">
                          <h3 className="text-lg font-semibold mb-4">Performance by Stock</h3>
                          <BarChart width={400} height={300} data={barChartData}>
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="value" fill="#3B82F6">
                              {barChartData.map((entry, index) => (
                                <Cell key={\`cell-\${index}\`} fill={entry.value >= 0 ? '#10B981' : '#EF4444'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-gray-50 rounded-xl p-6">
                      <h4 className="font-semibold text-gray-700 mb-2">Long-term Holdings</h4>
                      <p className="text-3xl font-bold text-green-600">{summary.longTermCount}</p>
                      <p className="text-sm text-gray-500">Held > 12 months</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-6">
                      <h4 className="font-semibold text-gray-700 mb-2">Short-term Holdings</h4>
                      <p className="text-3xl font-bold text-blue-600">{summary.shortTermCount}</p>
                      <p className="text-sm text-gray-500">Held < 12 months</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-6">
                      <h4 className="font-semibold text-gray-700 mb-2">Total Stocks</h4>
                      <p className="text-3xl font-bold text-purple-600">{holdings.length}</p>
                      <p className="text-sm text-gray-500">Active positions</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Add/Edit Modal */}
          {showAddModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <h2 className="text-2xl font-bold mb-6">
                  {editingStock ? 'Edit Stock' : 'Add Stock'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Symbol
                      </label>
                      <input
                        type="text"
                        value={formData.symbol}
                        onChange={(e) => setFormData({...formData, symbol: e.target.value})}
                        required
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="AAPL"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Quantity
                      </label>
                      <input
                        type="number"
                        value={formData.quantity}
                        onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                        required
                        min="0.01"
                        step="0.01"
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="100"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Buy Price
                      </label>
                      <input
                        type="number"
                        value={formData.buyPrice}
                        onChange={(e) => setFormData({...formData, buyPrice: e.target.value})}
                        required
                        min="0.01"
                        step="0.01"
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="150.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Buy Date
                      </label>
                      <input
                        type="date"
                        value={formData.buyDate}
                        onChange={(e) => setFormData({...formData, buyDate: e.target.value})}
                        required
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Commission (%)
                      </label>
                      <input
                        type="number"
                        value={formData.commission}
                        onChange={(e) => setFormData({...formData, commission: e.target.value})}
                        min="0"
                        step="0.01"
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Tax (%)
                      </label>
                      <input
                        type="number"
                        value={formData.tax}
                        onChange={(e) => setFormData({...formData, tax: e.target.value})}
                        min="0"
                        step="0.01"
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Service Charge
                      </label>
                      <input
                        type="number"
                        value={formData.serviceCharge}
                        onChange={(e) => setFormData({...formData, serviceCharge: e.target.value})}
                        min="0"
                        step="0.01"
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Investment Thesis / Notes
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                      rows="3"
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Why did you buy this stock?"
                    />
                  </div>
                  
                  <div className="flex gap-4">
                    <button
                      type="submit"
                      className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                      Save Stock
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddModal(false)
                        resetForm()
                      }}
                      className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Sell Modal */}
          {showSellModal && sellingStock && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
                <h2 className="text-2xl font-bold mb-6">Sell {sellingStock.symbol}</h2>
                <form onSubmit={handleSell} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Quantity to Sell (Max: {sellingStock.quantity})
                    </label>
                    <input
                      type="number"
                      value={sellData.quantity}
                      onChange={(e) => setSellData({...sellData, quantity: e.target.value})}
                      required
                      min="0.01"
                      max={sellingStock.quantity}
                      step="0.01"
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Sell Price
                    </label>
                    <input
                      type="number"
                      value={sellData.sellPrice}
                      onChange={(e) => setSellData({...sellData, sellPrice: e.target.value})}
                      required
                      min="0.01"
                      step="0.01"
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-4">
                    <button
                      type="submit"
                      className="flex-1 px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600"
                    >
                      Confirm Sale
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSellModal(false)
                        setSellData({ quantity: '', sellPrice: '' })
                      }}
                      className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}`;