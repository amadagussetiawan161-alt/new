'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createBrowserClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Order {
  id: string
  order_number: string
  total_amount: number
  status: string
  payment_method: string
  created_at: string
  user: { email: string } | null
  order_items: { id: string; product: { name: string } }[]
}
interface OrderRow {
  id: string
  order_number: string
  total_amount: number
  status: string
  payment_method: string
  created_at: string
  user: { email: string }[]
  order_items: { id: string; product: { name: string }[] }[]
}

export default function AdminOrdersPage() {
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState('all')
  const supabase = createBrowserClient()

  useEffect(() => {
    fetchOrders()
  }, [filter])

  const fetchOrders = async () => {
    let query = supabase.from('orders').select('id, order_number, total_amount, status, payment_method, created_at, user:profiles(email), order_items(id, product:products(name))').order('created_at', { ascending: false })
    if (filter !== 'all') query = query.eq('status', filter)
    const { data } = await query
    const formatted: Order[] = (data as OrderRow[])?.map(row => ({
      id: row.id, order_number: row.order_number, total_amount: row.total_amount, status: row.status, payment_method: row.payment_method, created_at: row.created_at,
      user: row.user?.[0] || null,
      order_items: (row.order_items || []).map(item => ({ id: item.id, product: item.product?.[0] || { name: '-' } }))
    })) || []
    setOrders(formatted)
    setLoading(false)
  }

  const updateStatus = async (orderId: string, newStatus: string) => {
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    if (error) toast.error('Failed to update status')
    else { toast.success('Status updated'); fetchOrders() }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': case 'completed': return 'bg-green-500/10 text-green-500'
      case 'pending': return 'bg-yellow-500/10 text-yellow-500'
      case 'processing': return 'bg-blue-500/10 text-blue-500'
      case 'cancelled': return 'bg-red-500/10 text-red-500'
      default: return 'bg-gray-500/10 text-gray-500'
    }
  }

  const statusOptions = ['pending', 'paid', 'processing', 'completed', 'cancelled']

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">Orders Management</h1><p className="text-muted-foreground">{orders.length} orders</p></div>
        <div className="flex gap-2">
          <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>All</Button>
          {statusOptions.map((s) => (<Button key={s} variant={filter === s ? 'default' : 'outline'} size="sm" onClick={() => setFilter(s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</Button>))}
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead><tr className="border-b"><th className="text-left py-3 px-4">Order</th><th className="text-left py-3 px-4">Customer</th><th className="text-left py-3 px-4">Items</th><th className="text-left py-3 px-4">Total</th><th className="text-left py-3 px-4">Status</th><th className="text-left py-3 px-4">Actions</th></tr></thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b">
                  <td className="py-3 px-4"><span className="font-medium">{order.order_number}</span><br/><span className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString()}</span></td>
                  <td className="py-3 px-4">{order.user?.email || '-'}</td>
                  <td className="py-3 px-4 text-sm">{order.order_items?.map(i => i.product?.name).join(', ')}</td>
                  <td className="py-3 px-4 font-semibold">${order.total_amount}</td>
                  <td className="py-3 px-4"><Badge className={getStatusColor(order.status)}>{order.status}</Badge></td>
                  <td className="py-3 px-4">
                    <select className="text-sm border rounded px-2 py-1" value={order.status} onChange={(e) => updateStatus(order.id, e.target.value)}>
                      {statusOptions.map((s) => (<option key={s} value={s}>{s}</option>))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
