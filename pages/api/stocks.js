const stocksApi = `import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  const { method } = req

  // Get user from header (simplified auth)
  const userId = req.headers['user-id'] || 'demo-user'

  switch (method) {
    case 'GET':
      try {
        const { data, error } = await supabase
          .from('stocks')
          .select('*')
          .eq('user_id', userId)
          .is('sell_date', null)

        if (error) throw error
        res.status(200).json(data || [])
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
      break

    case 'POST':
      try {
        const stockData = {
          ...req.body,
          user_id: userId,
          created_at: new Date().toISOString()
        }
        
        const { data, error } = await supabase
          .from('stocks')
          .insert([stockData])
          .select()

        if (error) throw error
        res.status(201).json(data[0])
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
      break

    case 'PUT':
      try {
        const { id, ...updates } = req.body
        
        const { data, error } = await supabase
          .from('stocks')
          .update(updates)
          .eq('id', id)
          .eq('user_id', userId)
          .select()

        if (error) throw error
        res.status(200).json(data[0])
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
      break

    case 'DELETE':
      try {
        const { id } = req.query
        
        const { error } = await supabase
          .from('stocks')
          .delete()
          .eq('id', id)
          .eq('user_id', userId)

        if (error) throw error
        res.status(200).json({ message: 'Stock deleted successfully' })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
      break

    default:
      res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE'])
      res.status(405).end(\`Method \${method} Not Allowed\`)
  }
}`;