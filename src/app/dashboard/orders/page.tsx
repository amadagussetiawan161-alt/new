'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createBrowserClient } from '@/lib/supabase/client'
import { Loader2, Package } from 'lucide-react'

interface Order {
  id: string
  order_number: string
  total_amount: number
  status: string
  payment_method: string
  created_at: string
  order_items: { id: string; product: { name: string } }[]
}
interface OrderRow {
  id: string
  order_number: string
  total_amount: number
  status: string
  payment_method: string
  created_at: string
  order_items: { id: string; product: { name: string }[] }[]
}

export default function OrdersPage() {
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const supabase = createBrowserClient()

  useEffect(() => {
    const fetchOrders = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('orders').select('id, order_number, total_amount, status, payment_method, created_at, order_items(id, product:products(name))').eq('user_id', user.id).order('created_at', { ascending: false })
      const formatted: Order[] = (data as OrderRow[])?.map(row => ({
        id: row.id, order_number: row.order_number, total_amount: row.total_amount, status: row.status, payment_method: row.payment_method, created_at: row.created_at,
        order_items: (row.order_items || []).map(item => ({ id: item.id, product: item.product?.[0] || { name: '-' } }))
      })) || []
      setOrders(formatted)
      setLoading(false)
    }
    fetchOrders()
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': case 'completed': return 'bg-green-500/10 text-green-500'
      case 'pending': return 'bg-yellow-500/10 text-yellow-500'
      case 'processing': return 'bg-blue-500/10 text-blue-500'
      case 'cancelled': return 'bg-red-500/10 text-red-500'
      default: return 'bg-gray-500/10 text-gray-500'
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div>
      <div className="mb-8"><h1 className="text-3xl font-bold">My Orders</h1><p className="text-muted-foreground">{orders.length} orders placed</p></div>

      {orders.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" /><h3 className="font-semibold mb-2">No orders yet</h3><p className="text-muted-foreground mb-4">Start shopping to see your orders here</p><Link href="/products"><Button>Browse Products</Button></Link></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold">{order.order_number}</span>
                      <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {order.order_items?.map((item, i) => <span key={item.id}>{item.product?.name}{i < order.order_items.length - 1 ? ', ' : ''}</span>)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-2">{new Date(order.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold">${order.total_amount}</span>
                    <div className="text-xs text-muted-foreground mt-1">{order.payment_method}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
