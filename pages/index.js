//const mainApp = 
import { useState, useEffect } from 'react'
import Head from 'next/head'
import Script from 'next/script'
import dynamic from 'next/dynamic'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'

// Dynamically import Recharts to avoid SSR issues
// const PieChart = dynamic(() => import('recharts').then(mod => mod.PieChart), { ssr: false })
// const Pie = dynamic(() => import('recharts').then(mod => mod.Pie), { ssr: false })
// const Cell = dynamic(() => import('recharts').then(mod => mod.Cell), { ssr: false })
// const BarChart = dynamic(() => import('recharts').then(mod => mod.BarChart), { ssr: false })
// const Bar = dynamic(() => import('recharts').then(mod => mod.Bar), { ssr: false })
// const XAxis = dynamic(() => import('recharts').then(mod => mod.XAxis), { ssr: false })
// const YAxis = dynamic(() => import('recharts').then(mod => mod.YAxis), { ssr: false })
// const Tooltip = dynamic(() => import('recharts').then(mod => mod.Tooltip), { ssr: false })

export default function Home() {
  const [holdings, setHoldings] = useState([])
  const [soldStocks, setSoldStocks] = useState([])
  const [transactions, setTransactions] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSellModal, setShowSellModal] = useState(false)
  const [currentTab, setCurrentTab] = useState('holdings')
  const [editingStock, setEditingStock] = useState(null)
  const [sellingStock, setSellingStock] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
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
      const allStocks = await response.json()
      
      // Separate active and sold stocks
      const activeHoldings = allStocks.filter(stock => !stock.sell_date)
      const soldStocks = allStocks.filter(stock => stock.sell_date)
      
      // Add current prices to active holdings
      if (activeHoldings.length > 0) {
        const symbols = activeHoldings.map(s => s.symbol).join(',')
        const pricesResponse = await fetch(`/api/prices?symbols=${symbols}`)
        const prices = await pricesResponse.json()
        
        const holdingsWithPrices = activeHoldings.map(stock => ({
          ...stock,
          currentPrice: prices[stock.symbol]?.price || stock.buy_price,
          currency: prices[stock.symbol]?.currency || (stock.symbol.includes('.NS') ? 'INR' : 'USD')
        }))
        setHoldings(holdingsWithPrices)
      } else {
        setHoldings([])
      }
      
      // Store sold stocks for P&L calculations
      setSoldStocks(soldStocks) // You'll need to add this state
      
    } catch (error) {
      console.error('Error loading holdings:', error)
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
    
    setIsRefreshing(true)
    
    const symbols = holdings.map(s => s.symbol).join(',')
    try {
      const response = await fetch(`/api/prices?symbols=${symbols}`)
      const data = await response.json()
      
      setHoldings(prev => prev.map(stock => ({
        ...stock,
        currentPrice: data[stock.symbol]?.price || stock.currentPrice,
        currency: data[stock.symbol]?.currency || (stock.symbol.includes('.NS') ? 'INR' : 'USD')
      })))
      
      await new Promise(resolve => setTimeout(resolve, 500))
      
    } catch (error) {
      console.error('Error updating prices:', error)
    } finally {
      setIsRefreshing(false)
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

    try {
      if (sellQuantity >= sellingStock.quantity) {
        // Selling entire position - update the stock record with sell data
        const updateData = {
          id: sellingStock.id,
          sell_price: sellPrice,
          sell_date: new Date().toISOString().split('T')[0]
        }
        
        await fetch('/api/stocks', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'user-id': getUserId()
          },
          body: JSON.stringify(updateData)
        })
      } else {
        // Partial sale - need to split the position
        // First, reduce the original position
        const updateData = {
          id: sellingStock.id,
          quantity: sellingStock.quantity - sellQuantity
        }
        
        await fetch('/api/stocks', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'user-id': getUserId()
          },
          body: JSON.stringify(updateData)
        })
        
        // Create a new "sold" record for the sold portion
        const soldStock = {
          symbol: sellingStock.symbol,
          quantity: sellQuantity,
          buy_price: sellingStock.buy_price,
          buy_date: sellingStock.buy_date,
          sell_price: sellPrice,
          sell_date: new Date().toISOString().split('T')[0],
          commission: sellingStock.commission,
          tax: sellingStock.tax,
          service_charge: sellingStock.service_charge,
          notes: `Partial sale from position bought on ${sellingStock.buy_date}`
        }
        
        await fetch('/api/stocks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'user-id': getUserId()
          },
          body: JSON.stringify(soldStock)
        })
      }

      // Add sell transaction to localStorage (since transactions table isn't being used in API)
      const newTransaction = {
        id: Date.now().toString(),
        date: new Date().toISOString().split('T')[0],
        type: 'SELL',
        symbol: sellingStock.symbol,
        quantity: sellQuantity,
        price: sellPrice,
        commission: sellingStock.commission,
        notes: `Sold from position bought on ${sellingStock.buy_date}`
      }
      
      const updatedTransactions = [newTransaction, ...transactions]
      setTransactions(updatedTransactions)
      localStorage.setItem('portfolio_transactions', JSON.stringify(updatedTransactions))

      // Reload holdings from database
      await loadHoldings()
      
      setShowSellModal(false)
      setSellData({ quantity: '', sellPrice: '' })
      
    } catch (error) {
      console.error('Error selling stock:', error)
      alert('Error processing sale. Please try again.')
    }
  }

  const deleteStock = async (id) => {
    if (!confirm('Are you sure you want to delete this stock?')) return
    
    try {
      await fetch(`/api/stocks?id=${id}`, {
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
    const currentPrice = holding.currentPrice || holding.buy_price
    const currentValue = holding.quantity * holding.currentPrice
    const buyCommission = buyValue * (holding.commission / 100)
    const buyTotal = buyValue + buyCommission + (holding.service_charge || 0)
    
    const pl = currentValue - buyTotal
    const plPercent = buyTotal > 0 ? (pl / buyTotal) * 100 : 0 
    
    return { pl, plPercent, buyTotal, currentValue }
  }

  const calculateHoldingPeriod = (buyDate) => {
    const buy = new Date(buyDate)
    const now = new Date()
    const days = Math.floor((now - buy) / (1000 * 60 * 60 * 24))
    const months = Math.floor(days / 30)
    const years = Math.floor(days / 365)
    
    if (years > 0) return `${years}y ${months % 12}m`
    if (months > 0) return `${months}m ${days % 30}d`
    return `${days}d`
  }

  const isLongTerm = (buyDate) => {
    const buy = new Date(buyDate)
    const now = new Date()
    const days = Math.floor((now - buy) / (1000 * 60 * 60 * 24))
    return days >= 365
  }

  // // Summary calculations
  // const summary = holdings.reduce((acc, holding) => {
  //   const calc = calculatePL(holding)
  //   acc.totalInvested += calc.buyTotal
  //   acc.currentValue += calc.currentValue
  //   acc.totalPL += calc.pl
  //   acc.longTermCount += isLongTerm(holding.buy_date) ? 1 : 0
  //   acc.shortTermCount += isLongTerm(holding.buy_date) ? 0 : 1
  //   return acc
  // }, { totalInvested: 0, currentValue: 0, totalPL: 0, longTermCount: 0, shortTermCount: 0 })

    // Enhanced summary calculations with currency separation
  const summary = holdings.reduce((acc, holding) => {
    const calc = calculatePL(holding)
    const isINR = holding.currency === 'INR'
    
    if (isINR) {
      acc.totalInvestedINR += calc.buyTotal
      acc.currentValueINR += calc.currentValue
      acc.totalPLINR += calc.pl
    } else {
      acc.totalInvestedUSD += calc.buyTotal
      acc.currentValueUSD += calc.currentValue
      acc.totalPLUSD += calc.pl
    }
    
    acc.totalInvested += calc.buyTotal
    acc.currentValue += calc.currentValue
    acc.totalPL += calc.pl
    acc.longTermCount += isLongTerm(holding.buy_date) ? 1 : 0
    acc.shortTermCount += isLongTerm(holding.buy_date) ? 0 : 1
    
    return acc
  }, { 
    totalInvested: 0, currentValue: 0, totalPL: 0, 
    totalInvestedUSD: 0, currentValueUSD: 0, totalPLUSD: 0,
    totalInvestedINR: 0, currentValueINR: 0, totalPLINR: 0,
    longTermCount: 0, shortTermCount: 0 
  })

  // Add realized P&L separation
  const realizedPLSeparated = soldStocks.reduce((acc, stock) => {
    if (stock.sell_price && stock.sell_date) {
      const buyValue = stock.quantity * stock.buy_price
      const sellValue = stock.quantity * stock.sell_price
      const buyCommission = buyValue * (stock.commission / 100)
      const sellCommission = sellValue * (stock.commission / 100)
      const buyTotal = buyValue + buyCommission + (stock.service_charge || 0)
      const sellTotal = sellValue - sellCommission
      const realized = sellTotal - buyTotal
      
      const isINR = stock.currency === 'INR' || stock.symbol.includes('.NS')
      
      if (isINR) {
        acc.realizedPLINR += realized
      } else {
        acc.realizedPLUSD += realized
      }
      
      acc.realizedPLTotal += realized
    }
    return acc
  }, { realizedPLUSD: 0, realizedPLINR: 0, realizedPLTotal: 0 })

  summary.totalPL += realizedPLSeparated.realizedPLTotal
  summary.totalPLPercent = summary.totalInvested > 0 ? (summary.totalPL / summary.totalInvested) * 100 : 0

  // // Add realized P&L from sold stocks
  // const realizedPL = soldStocks.reduce((total, stock) => {
  //   if (stock.sell_price && stock.sell_date) {
  //     const buyValue = stock.quantity * stock.buy_price
  //     const sellValue = stock.quantity * stock.sell_price
  //     const buyCommission = buyValue * (stock.commission / 100)
  //     const sellCommission = sellValue * (stock.commission / 100)
  //     const buyTotal = buyValue + buyCommission + (stock.service_charge || 0)
  //     const sellTotal = sellValue - sellCommission
  //     const realized = sellTotal - buyTotal
  //     return total + realized
  //   }
  //   return total
  // }, 0)

  // summary.totalPL += realizedPL
  // summary.totalPLPercent = summary.totalInvested > 0 ? (summary.totalPL / summary.totalInvested) * 100 : 0
  
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

  const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', 
  '#14B8A6', '#F97316', '#6366F1', '#84CC16', '#F43F5E', '#06B6D4',
  '#8B5A2B', '#7C3AED', '#059669', '#DC2626', '#7C2D12', '#1E40AF']

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
                  disabled={isRefreshing}
                  className={`px-6 py-3 text-white rounded-xl transition-all duration-300 ${
                    isRefreshing 
                      ? 'bg-blue-400 cursor-not-allowed' 
                      : 'bg-blue-500 hover:bg-blue-600 hover:scale-105'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`${isRefreshing ? 'animate-spin' : ''}`}>
                      🔄
                    </span>
                    <span>
                      {isRefreshing ? 'Refreshing...' : 'Refresh Prices'}
                    </span>
                  </div>
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

          {/* Enhanced Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {/* Total Invested & Current Value - Combined Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-200 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-500 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-blue-700 bg-blue-200 px-3 py-1 rounded-full">
                  Portfolio Value
                </span>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-blue-600 font-medium">Total Invested</p>
                  {summary.totalInvestedUSD > 0 && (
                    <p className="text-xl font-bold text-gray-900">
                      ${summary.totalInvestedUSD.toLocaleString('en-US', {minimumFractionDigits: 2})}
                    </p>
                  )}
                  {summary.totalInvestedINR > 0 && (
                    <p className="text-xl font-bold text-gray-900">
                      ₹{summary.totalInvestedINR.toLocaleString('en-IN', {minimumFractionDigits: 2})}
                    </p>
                  )}
                  {summary.totalInvestedUSD > 0 && summary.totalInvestedINR > 0 && (
                    <p className="text-xs text-gray-500">Mixed currencies</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-blue-600 font-medium">Current Value</p>
                  {summary.currentValueUSD > 0 && (
                    <p className="text-xl font-bold text-gray-900">
                      ${summary.currentValueUSD.toLocaleString('en-US', {minimumFractionDigits: 2})}
                    </p>
                  )}
                  {summary.currentValueINR > 0 && (
                    <p className="text-xl font-bold text-gray-900">
                      ₹{summary.currentValueINR.toLocaleString('en-IN', {minimumFractionDigits: 2})}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Unrealized & Realized P&L - Combined Card */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-100 border border-green-200 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-500 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-green-700 bg-green-200 px-3 py-1 rounded-full">
                  Performance
                </span>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-green-600 font-medium">Unrealized P&L</p>
                  {((summary.totalPLUSD || 0) - (realizedPLSeparated?.realizedPLUSD || 0)) !== 0 && (
                    <p className={`text-xl font-bold ${((summary.totalPLUSD || 0) - (realizedPLSeparated?.realizedPLUSD || 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {((summary.totalPLUSD || 0) - (realizedPLSeparated?.realizedPLUSD || 0)) >= 0 ? '+' : ''}$
                      {Math.abs((summary.totalPLUSD || 0) - (realizedPLSeparated?.realizedPLUSD || 0)).toLocaleString('en-US', {minimumFractionDigits: 2})}
                    </p>
                  )}
                  {((summary.totalPLINR || 0) - (realizedPLSeparated?.realizedPLINR || 0)) !== 0 && (
                    <p className={`text-xl font-bold ${((summary.totalPLINR || 0) - (realizedPLSeparated?.realizedPLINR || 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {((summary.totalPLINR || 0) - (realizedPLSeparated?.realizedPLINR || 0)) >= 0 ? '+' : ''}₹
                      {Math.abs((summary.totalPLINR || 0) - (realizedPLSeparated?.realizedPLINR || 0)).toLocaleString('en-IN', {minimumFractionDigits: 2})}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">Active holdings</p>
                </div>
                <div>
                  <p className="text-sm text-green-600 font-medium">Realized P&L</p>
                  {(realizedPLSeparated?.realizedPLUSD || 0) !== 0 && (
                    <p className={`text-xl font-bold ${(realizedPLSeparated?.realizedPLUSD || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(realizedPLSeparated?.realizedPLUSD || 0) >= 0 ? '+' : ''}$
                      {Math.abs(realizedPLSeparated?.realizedPLUSD || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}
                    </p>
                  )}
                  {(realizedPLSeparated?.realizedPLINR || 0) !== 0 && (
                    <p className={`text-xl font-bold ${(realizedPLSeparated?.realizedPLINR || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(realizedPLSeparated?.realizedPLINR || 0) >= 0 ? '+' : ''}₹
                      {Math.abs(realizedPLSeparated?.realizedPLINR || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}
                    </p>
                  )}
                  <p className="text-xs text-gray-500">From completed sales</p>
                </div>
              </div>
            </div>

            {/* Total P&L & Holdings - Combined Card */}
            <div className="bg-gradient-to-br from-purple-50 to-violet-100 border border-purple-200 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-500 rounded-xl">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-purple-700 bg-purple-200 px-3 py-1 rounded-full">
                  Summary
                </span>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-purple-600 font-medium">Total P&L</p>
                  <p className="text-lg font-bold text-gray-600">Mixed Portfolio</p>
                  <p className={`text-sm font-semibold ${summary.totalPLPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {summary.totalPLPercent >= 0 ? '+' : ''}{summary.totalPLPercent.toFixed(2)}% return
                  </p>
                </div>
                <div>
                  <p className="text-sm text-purple-600 font-medium">Active Holdings</p>
                  <p className="text-2xl font-bold text-gray-900">{holdings.length}</p>
                  <p className="text-xs text-gray-500">
                    {summary.longTermCount} LTCG • {summary.shortTermCount} STCG
                  </p>
                </div>
              </div>
            </div>
          </div>
          {/* Tabs */}
          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-xl">
            <div className="flex border-b">
              <button
                onClick={() => setCurrentTab('holdings')}
                className={`px-6 py-3 font-semibold transition-all ${
                  currentTab === 'holdings' 
                    ? 'border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Holdings
              </button>
              <button
                onClick={() => setCurrentTab('transactions')}
                className={`px-6 py-3 font-semibold transition-all ${
                  currentTab === 'transactions' 
                    ? 'border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Transactions
              </button>
              <button
                onClick={() => setCurrentTab('analytics')}
                className={`px-6 py-3 font-semibold transition-all ${
                  currentTab === 'analytics' 
                    ? 'border-b-2 border-blue-500 text-blue-600' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Analytics
              </button>
            </div>

            <div className="p-6">
              {/* Holdings Tab */}
              {currentTab === 'holdings' && (
                <div className="space-y-8">
                  {/* Active Holdings Section */}
                  <div className="overflow-x-auto">
                    <h3 className="text-lg font-semibold mb-4">Active Holdings</h3>
                    {holdings.length === 0 ? (
                      <p className="text-center py-8 text-gray-500">
                        No active holdings. Click "Add Stock" to get started.
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
                                    <span className="font-semibold">{holding.symbol}</span>
                                    {ltcg && (
                                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                        LTCG
                                      </span>
                                    )}
                                  </div>
                                </td>
                                {console.log('Holdings data:', holdings.map(h => ({ symbol: h.symbol, currentPrice: h.currentPrice, type: typeof h.currentPrice })))}
                                <td className="py-3 px-4">{holding.quantity}</td>
                                <td className="py-3 px-4">{holding.currency === 'INR' ? '₹' : '$'}{Number(holding.currentPrice || holding.buy_price).toFixed(2)}</td>
                                <td className="py-3 px-4">
                                  <span className={`font-semibold ${
                                    (holding.currentPrice || holding.buy_price) > holding.buy_price ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {holding.currency === 'INR' ? '₹' : '$'}{(holding.currentPrice || holding.buy_price).toFixed(2)}
                                  </span>
                                </td>
                                <td className="py-3 px-4">{period}</td>
                                <td className="py-3 px-4">
                                  <span className={`font-semibold ${
                                    calc.pl >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {calc.pl >= 0 ? '+' : ''}{holding.currency === 'INR' ? '₹' : '$'}{Math.abs(calc.pl).toFixed(2)}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`font-semibold ${
                                    calc.plPercent >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {calc.plPercent >= 0 ? '+' : ''}{calc.plPercent.toFixed(2)}%
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

                  {/* Sold Positions Section */}
                  {soldStocks.length > 0 && (
                    <div className="overflow-x-auto">
                      <h3 className="text-lg font-semibold mb-4">Sold Positions</h3>
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-4">Symbol</th>
                            <th className="text-left py-3 px-4">Qty</th>
                            <th className="text-left py-3 px-4">Buy Price</th>
                            <th className="text-left py-3 px-4">Sell Price</th>
                            <th className="text-left py-3 px-4">Buy Date</th>
                            <th className="text-left py-3 px-4">Sell Date</th>
                            <th className="text-left py-3 px-4">Realized P&L</th>
                            <th className="text-left py-3 px-4">Return %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {soldStocks.map(stock => {
                            const buyValue = stock.quantity * stock.buy_price
                            const sellValue = stock.quantity * stock.sell_price
                            const buyCommission = buyValue * (stock.commission / 100)
                            const sellCommission = sellValue * (stock.commission / 100)
                            const buyTotal = buyValue + buyCommission + (stock.service_charge || 0)
                            const sellTotal = sellValue - sellCommission
                            const realizedPL = sellTotal - buyTotal
                            const returnPercent = (realizedPL / buyTotal) * 100
                            
                            return (
                              <tr key={stock.id} className="border-b hover:bg-gray-50 bg-gray-25">
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold">{stock.symbol}</span>
                                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                                      SOLD
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-4">{stock.quantity}</td>
                                <td className="py-3 px-4">${stock.buy_price.toFixed(2)}</td>
                                <td className="py-3 px-4">${stock.sell_price.toFixed(2)}</td>
                                <td className="py-3 px-4">{stock.buy_date}</td>
                                <td className="py-3 px-4">{stock.sell_date}</td>
                                <td className="py-3 px-4">
                                  <span className={`font-semibold ${
                                    realizedPL >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {realizedPL >= 0 ? '+' : ''}${Math.abs(realizedPL).toFixed(2)}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className={`font-semibold ${
                                    returnPercent >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {returnPercent >= 0 ? '+' : ''}{returnPercent.toFixed(2)}%
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
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
                              <span className={`px-2 py-1 rounded text-sm font-semibold ${
                                tx.type === 'BUY' 
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {tx.type}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-semibold">{tx.symbol}</td>
                            <td className="py-3 px-4">{tx.quantity}</td>
                            <td className="py-3 px-4">${tx.price.toFixed(2)}</td>
                            <td className="py-3 px-4 font-semibold">
                              ${(tx.quantity * tx.price).toFixed(2)}
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
                              dataKey="value"
                              label={(entry) => entry.name}
                            >
                              {pieChartData.map((entry, index) => (
                                <Cell key={index} fill={COLORS[index % COLORS.length]} />
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
                                <Cell key={`cell-${index}`} fill={entry.value >= 0 ? '#10B981' : '#EF4444'} />
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
                      <p className="text-sm text-gray-500">Held &gt; 12 months</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-6">
                      <h4 className="font-semibold text-gray-700 mb-2">Short-term Holdings</h4>
                      <p className="text-3xl font-bold text-blue-600">{summary.shortTermCount}</p>
                      <p className="text-sm text-gray-500">Held &lt; 12 months</p>
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
};