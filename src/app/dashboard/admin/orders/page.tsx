'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createBrowserClient } from '@/lib/supabase/client'
import { Loader2, X, User, DollarSign } from 'lucide-react'
import { toast } from 'sonner'

interface Order {
  id: string
  order_number: string
  total_amount: number
  status: string
  payment_method: string
  created_at: string
  user: { email: string; full_name: string | null } | null
  order_items: { id: string; product: { name: string } }[]
  // Affiliate fields
  affiliate_id: string | null
  referral_code: string | null
  commission_amount: number | null
  commission_status: string | null
  affiliate: {
    referral_code: string
    profiles: { full_name: string | null; email: string | null } | null
  } | null
}

interface OrderRow {
  id: string
  order_number: string
  total_amount: number
  status: string
  payment_method: string
  created_at: string
  user: { email: string; full_name: string | null }[]
  order_items: { id: string; product: { name: string }[] }[]
  affiliate_id: string | null
  referral_code: string | null
  commission_amount: number | null
  commission_status: string | null
  affiliate: {
    referral_code: string
    profiles: { full_name: string | null; email: string | null }
  }[] | null
}

export default function AdminOrdersPage() {
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const supabase = createBrowserClient()

  useEffect(() => {
    fetchOrders()
  }, [filter])

  const fetchOrders = async () => {
    let query = supabase
      .from('orders')
      .select(`
        id, order_number, total_amount, status, payment_method, created_at,
        affiliate_id, referral_code, commission_amount, commission_status,
        user:profiles(email, full_name),
        order_items(id, product:products(name)),
        affiliate:affiliates(referral_code, profiles(full_name, email))
      `)
      .order('created_at', { ascending: false })

    if (filter !== 'all') query = query.eq('status', filter)
    const { data } = await query
    const formatted: Order[] = (data as OrderRow[])?.map(row => ({
      id: row.id,
      order_number: row.order_number,
      total_amount: row.total_amount,
      status: row.status,
      payment_method: row.payment_method,
      created_at: row.created_at,
      affiliate_id: row.affiliate_id,
      referral_code: row.referral_code,
      commission_amount: row.commission_amount,
      commission_status: row.commission_status,
      user: row.user?.[0] || null,
      order_items: (row.order_items || []).map(item => ({ id: item.id, product: item.product?.[0] || { name: '-' } })),
      affiliate: row.affiliate?.[0] || null
    })) || []
    setOrders(formatted)
    setLoading(false)
  }

  const updateStatus = async (orderId: string, newStatus: string) => {
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    if (error) toast.error('Failed to update status')
    else { toast.success('Status updated'); fetchOrders() }
  }

  const formatIDR = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)

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
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4">Order</th>
                <th className="text-left py-3 px-4">Customer</th>
                <th className="text-left py-3 px-4">Items</th>
                <th className="text-left py-3 px-4">Total</th>
                <th className="text-left py-3 px-4">Affiliate</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-left py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <span className="font-medium">{order.order_number}</span><br/>
                    <span className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString()}</span>
                  </td>
                  <td className="py-3 px-4">
                    <div>{order.user?.full_name || '-'}</div>
                    <div className="text-xs text-muted-foreground">{order.user?.email || '-'}</div>
                  </td>
                  <td className="py-3 px-4 text-sm">{order.order_items?.map(i => i.product?.name).join(', ')}</td>
                  <td className="py-3 px-4 font-semibold">{formatIDR(Number(order.total_amount))}</td>
                  <td className="py-3 px-4">
                    {order.affiliate ? (
                      <div>
                        <div className="text-sm font-medium">{order.affiliate.profiles?.full_name || order.affiliate.referral_code}</div>
                        <div className="text-xs text-muted-foreground">{order.affiliate.referral_code}</div>
                        {order.commission_amount && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs mt-1">
                            {formatIDR(Number(order.commission_amount))}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">No Affiliate</span>
                    )}
                  </td>
                  <td className="py-3 px-4"><Badge className={getStatusColor(order.status)}>{order.status}</Badge></td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)}>Detail</Button>
                      <select className="text-sm border rounded px-2 py-1" value={order.status} onChange={(e) => updateStatus(order.id, e.target.value)}>
                        {statusOptions.map((s) => (<option key={s} value={s}>{s}</option>))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Order Detail</h3>
              <button onClick={() => setSelectedOrder(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-slate-500">Order Number</span>
                <span className="font-mono font-medium">{selectedOrder.order_number}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-slate-500">Customer</span>
                <div className="text-right">
                  <div className="font-medium">{selectedOrder.user?.full_name || '-'}</div>
                  <div className="text-sm text-muted-foreground">{selectedOrder.user?.email}</div>
                </div>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-slate-500">Total</span>
                <span className="font-bold text-lg">{formatIDR(Number(selectedOrder.total_amount))}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-slate-500">Status</span>
                <Badge className={getStatusColor(selectedOrder.status)}>{selectedOrder.status}</Badge>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-slate-500">Payment Method</span>
                <span>{selectedOrder.payment_method || '-'}</span>
              </div>

              {/* Affiliate Information Section */}
              <div className="mt-4 pt-4 border-t">
                <h4 className="font-medium mb-3">Affiliate Information</h4>
                {selectedOrder.affiliate_id && selectedOrder.affiliate ? (
                  <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <User className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Affiliate Name</p>
                        <p className="font-medium">{selectedOrder.affiliate.profiles?.full_name || 'Unknown'}</p>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Affiliate Code</span>
                      <span className="font-mono">{selectedOrder.affiliate.referral_code}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Affiliate Email</span>
                      <span>{selectedOrder.affiliate.profiles?.email || '-'}</span>
                    </div>
                    {selectedOrder.referral_code && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Referral Code Used</span>
                        <span className="font-mono">{selectedOrder.referral_code}</span>
                      </div>
                    )}
                    {selectedOrder.commission_amount !== null && (
                      <div className="flex justify-between text-sm items-center">
                        <span className="text-slate-500">Commission</span>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-emerald-600" />
                          <span className="font-bold text-emerald-600">{formatIDR(Number(selectedOrder.commission_amount))}</span>
                        </div>
                      </div>
                    )}
                    {selectedOrder.commission_status && (
                      <div className="flex justify-between text-sm items-center">
                        <span className="text-slate-500">Commission Status</span>
                        <Badge className={`${
                          selectedOrder.commission_status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                          selectedOrder.commission_status === 'approved' ? 'bg-blue-100 text-blue-700' :
                          selectedOrder.commission_status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        } border-0`}>
                          {selectedOrder.commission_status}
                        </Badge>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 bg-slate-50 rounded-lg">
                    <User className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-400">No Affiliate Assigned</p>
                  </div>
                )}
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={() => setSelectedOrder(null)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
