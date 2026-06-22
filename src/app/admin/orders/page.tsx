'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createBrowserClient } from '@/lib/supabase/client'
import { Loader2, Check, X, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface Order {
  id: string
  order_number: string
  total_amount: number
  status: string
  payment_method: string
  created_at: string
  user: { email: string } | null
  order_items: { product: { name: string } | null }[]
}

interface OrderRow {
  id: string
  order_number: string
  total_amount: number
  status: string
  payment_method: string
  created_at: string
  user: { email: string }[]
  order_items: { product: { name: string }[] }[]
}

const formatIDR = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)

const STATUS_TABS = ['all', 'pending', 'paid', 'processing', 'completed', 'cancelled']

export default function AdminOrdersPage() {
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const supabase = createBrowserClient()

  useEffect(() => { fetchOrders() }, [filter])

  const fetchOrders = async () => {
    let query = supabase
      .from('orders')
      .select('id, order_number, total_amount, status, payment_method, created_at, user:profiles(email), order_items(product:products(name))')
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
      user: row.user?.[0] || null,
      order_items: (row.order_items || []).map(item => ({
        product: item.product?.[0] || null
      }))
    })) || []
    setOrders(formatted)
    setLoading(false)
  }

  const updateStatus = async (orderId: string, newStatus: string) => {
    setActionLoading(orderId + newStatus)
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    if (error) toast.error('Gagal mengubah status')
    else {
      toast.success(`Status berhasil diubah ke ${newStatus}`)
      fetchOrders()
    }
    setActionLoading(null)
  }

  const deleteOrder = async (orderId: string) => {
    setActionLoading(orderId + 'delete')
    const { error } = await supabase.from('orders').delete().eq('id', orderId)
    if (error) toast.error('Gagal menghapus order')
    else {
      toast.success('Order berhasil dihapus')
      setOrders(prev => prev.filter(o => o.id !== orderId))
    }
    setActionLoading(null)
    setDeleteConfirm(null)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': case 'completed':
        return <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-0 capitalize">{status}</Badge>
      case 'pending':
        return <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border-0">Pending</Badge>
      case 'processing':
        return <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 border-0">Processing</Badge>
      case 'cancelled':
        return <Badge className="bg-red-50 text-red-700 hover:bg-red-50 border-0">Cancelled</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const counts = STATUS_TABS.map(s => ({
    status: s,
    count: s === 'all' ? orders.length : orders.filter(o => o.status === s).length
  }))

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Orders</h1>
          <p className="text-slate-500 mt-0.5">{orders.length} orders</p>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 mb-6 flex-wrap">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 text-sm rounded-lg transition-colors capitalize ${
              filter === s
                ? 'bg-blue-600 text-white font-medium'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s === 'all' ? 'All Orders' : s}
            {filter !== s && (
              <span className="ml-1.5 text-xs opacity-60">
                ({s === 'all'
                  ? orders.length
                  : orders.filter(o => o.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <Card className="bg-white border-slate-200">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <p className="text-base">Tidak ada order ditemukan</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Order</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Customer</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Items</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Total</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Tanggal</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order) => {
                    const isDeleting = deleteConfirm === order.id
                    return (
                      <tr key={order.id} className={`hover:bg-slate-50 transition-colors ${isDeleting ? 'bg-red-50' : ''}`}>
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-sm font-medium text-slate-900">
                            {order.order_number || `#${order.id.slice(0, 8)}`}
                          </span>
                          {order.payment_method && (
                            <p className="text-xs text-slate-400 mt-0.5">{order.payment_method}</p>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-sm text-slate-700">{order.user?.email || '-'}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-sm text-slate-600 line-clamp-1 max-w-[160px]">
                            {order.order_items.map(i => i.product?.name).filter(Boolean).join(', ') || '-'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-sm text-slate-900">
                            {formatIDR(Number(order.total_amount))}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">{getStatusBadge(order.status)}</td>
                        <td className="py-3.5 px-4">
                          <span className="text-xs text-slate-500">
                            {new Date(order.created_at).toLocaleDateString('id-ID', {
                              day: 'numeric', month: 'short', year: 'numeric'
                            })}
                          </span>
                          <p className="text-xs text-slate-400">
                            {new Date(order.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </td>
                        <td className="py-3.5 px-4">
                          {isDeleting ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" /> Hapus?
                              </span>
                              <button
                                onClick={() => deleteOrder(order.id)}
                                disabled={!!actionLoading}
                                className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                              >
                                Ya
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300 transition-colors"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {order.status !== 'paid' && order.status !== 'completed' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300"
                                  onClick={() => updateStatus(order.id, 'paid')}
                                  disabled={!!actionLoading}
                                  title="Konfirmasi Paid"
                                >
                                  {actionLoading === order.id + 'paid' ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <><Check className="h-3 w-3 mr-1" />Paid</>
                                  )}
                                </Button>
                              )}
                              {order.status !== 'cancelled' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                                  onClick={() => updateStatus(order.id, 'cancelled')}
                                  disabled={!!actionLoading}
                                  title="Cancel Order"
                                >
                                  {actionLoading === order.id + 'cancelled' ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <><X className="h-3 w-3 mr-1" />Cancel</>
                                  )}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                                onClick={() => setDeleteConfirm(order.id)}
                                disabled={!!actionLoading}
                                title="Hapus Order"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
