'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createBrowserClient } from '@/lib/supabase/client'
import { Loader2, Check, X, Trash2, AlertTriangle, Eye, ZoomIn, CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Order {
  id: string
  order_number: string
  total_amount: number
  status: string
  payment_status: string
  order_status: string
  payment_method: string
  payment_proof: string | null
  rejection_reason: string | null
  created_at: string
  user: { email: string } | null
  order_items: { product: { name: string } | null }[]
  payment_account: {
    payment_name: string
    type: string
    bank_name: string | null
    account_number: string | null
    account_holder: string | null
  } | null
}

const formatIDR = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)

const PAYMENT_STATUS_OPTIONS = ['all', 'pending_payment', 'pending_verification', 'paid', 'rejected']
const ORDER_STATUS_OPTIONS = ['all', 'pending', 'processing', 'completed', 'cancelled']

const paymentStatusBadge = (status: string) => {
  switch (status) {
    case 'paid': return <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-0">Paid</Badge>
    case 'pending_payment': return <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border-0">Pending Payment</Badge>
    case 'pending_verification': return <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 border-0">Pending Verification</Badge>
    case 'rejected': return <Badge className="bg-red-50 text-red-700 hover:bg-red-50 border-0">Rejected</Badge>
    default: return <Badge variant="secondary">{status || '-'}</Badge>
  }
}

const orderStatusBadge = (status: string) => {
  switch (status) {
    case 'processing': return <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 border-0">Processing</Badge>
    case 'completed': return <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-0">Completed</Badge>
    case 'pending': return <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border-0">Pending</Badge>
    case 'cancelled': return <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 border-0">Cancelled</Badge>
    default: return <Badge variant="secondary">{status || '-'}</Badge>
  }
}

export default function AdminOrdersPage() {
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [filterPayment, setFilterPayment] = useState('all')
  const [filterOrder, setFilterOrder] = useState('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [zoomProof, setZoomProof] = useState<string | null>(null)
  const supabase = createBrowserClient()

  useEffect(() => { fetchOrders() }, [filterPayment, filterOrder])

  const fetchOrders = async () => {
    let query = supabase
      .from('orders')
      .select(`
        id, order_number, total_amount, status, payment_status, order_status,
        payment_method, payment_proof, rejection_reason, created_at,
        user:profiles(email),
        order_items(product:products(name)),
        payment_account:payment_accounts(payment_name, type, bank_name, account_number, account_holder)
      `)
      .order('created_at', { ascending: false })
    if (filterPayment !== 'all') query = query.eq('payment_status', filterPayment)
    if (filterOrder !== 'all') query = query.eq('order_status', filterOrder)
    const { data } = await query
    const formatted: Order[] = (data as any[])?.map(row => ({
      id: row.id,
      order_number: row.order_number,
      total_amount: row.total_amount,
      status: row.status,
      payment_status: row.payment_status,
      order_status: row.order_status,
      payment_method: row.payment_method,
      payment_proof: row.payment_proof,
      rejection_reason: row.rejection_reason,
      created_at: row.created_at,
      user: Array.isArray(row.user) ? row.user[0] : row.user,
      order_items: (row.order_items || []).map((item: any) => ({
        product: Array.isArray(item.product) ? item.product[0] : item.product
      })),
      payment_account: Array.isArray(row.payment_account) ? row.payment_account[0] : row.payment_account,
    })) || []
    setOrders(formatted)
    setLoading(false)
  }

  const generateLicenseKey = (pattern: string, orderId?: string, userId?: string): string => {
    const random = () => Math.random().toString(36).substr(2, 8).toUpperCase()
    const now = new Date()
    return pattern
      .replace(/{RANDOM}/g, random())
      .replace(/{YYYY}/g, String(now.getFullYear()))
      .replace(/{MM}/g, String(now.getMonth() + 1).padStart(2, '0'))
      .replace(/{DD}/g, String(now.getDate()).padStart(2, '0'))
      .replace(/{ORDER_ID}/g, (orderId || '').slice(0, 8).toUpperCase())
      .replace(/{USER_ID}/g, (userId || '').slice(0, 8).toUpperCase())
  }

  const approvePayment = async (orderId: string) => {
    setActionLoading(orderId + 'approve')

    // Update order statuses
    const { error } = await supabase.from('orders').update({
      payment_status: 'paid',
      order_status: 'processing',
      status: 'processing',
      rejection_reason: null,
    }).eq('id', orderId)

    if (error) { toast.error('Gagal approve'); setActionLoading(null); return }

    // Fetch order details for license/download generation
    const { data: order } = await supabase
      .from('orders')
      .select('id, user_id, order_items(product_id, product:products(id, name, license_enabled, download_type, download_url, license_duration, custom_license_days))')
      .eq('id', orderId)
      .single()

    if (order) {
      // Fetch default active license template
      const { data: templates } = await supabase.from('license_templates').select('*').eq('is_active', true).limit(1)
      const template = templates?.[0]

      for (const item of (order.order_items as any[]) || []) {
        const product = Array.isArray(item.product) ? item.product[0] : item.product
        if (!product) continue

        // Auto-generate license if product has license_enabled
        if (product.license_enabled) {
          // Check if license already exists for this order+product
          const { data: existing } = await supabase.from('licenses')
            .select('id').eq('order_id', orderId).eq('product_id', product.id).limit(1)
          if (!existing || existing.length === 0) {
            const pattern = template?.pattern || 'LICENSE-{RANDOM}'
            const licKey = generateLicenseKey(pattern, orderId, order.user_id)
            let expiresAt: string | null = null
            if (template?.validity_days) {
              const d = new Date()
              d.setDate(d.getDate() + template.validity_days)
              expiresAt = d.toISOString()
            } else if (product.license_duration === 'days' && product.custom_license_days) {
              const d = new Date()
              d.setDate(d.getDate() + product.custom_license_days)
              expiresAt = d.toISOString()
            } else if (product.license_duration === '1_year') {
              const d = new Date()
              d.setFullYear(d.getFullYear() + 1)
              expiresAt = d.toISOString()
            }
            await supabase.from('licenses').insert({
              user_id: order.user_id,
              product_id: product.id,
              order_id: orderId,
              template_id: template?.id || null,
              license_key: licKey,
              status: 'active',
              activated_at: new Date().toISOString(),
              expires_at: expiresAt,
              purchase_date: new Date().toISOString(),
            })
          }
        }

        // Auto-add to user_downloads if product has download_type
        if (product.download_type) {
          await supabase.from('user_downloads').upsert({
            user_id: order.user_id,
            product_id: product.id,
            order_id: orderId,
            download_count: 0,
            is_disabled: false,
            created_at: new Date().toISOString(),
          }, { onConflict: 'user_id,product_id' })
        }
      }
    }

    toast.success('Pembayaran dikonfirmasi — lisensi & akses download diterbitkan')
    fetchOrders()
    setDetailOrder(null)
    setActionLoading(null)
  }

  const rejectPayment = async (orderId: string) => {
    if (!rejectReason.trim()) { toast.error('Alasan penolakan wajib diisi'); return }
    setActionLoading(orderId + 'reject')
    const { error } = await supabase.from('orders').update({
      payment_status: 'rejected',
      order_status: 'pending',
      status: 'pending',
      rejection_reason: rejectReason.trim(),
    }).eq('id', orderId)
    if (error) toast.error('Gagal reject')
    else { toast.success('Pembayaran ditolak'); setShowRejectForm(false); setRejectReason(''); fetchOrders(); setDetailOrder(null) }
    setActionLoading(null)
  }

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    setActionLoading(orderId + newStatus)
    await supabase.from('orders').update({ order_status: newStatus, status: newStatus }).eq('id', orderId)
    toast.success('Status diperbarui')
    setActionLoading(null)
    fetchOrders()
  }

  const deleteOrder = async (orderId: string) => {
    setActionLoading(orderId + 'delete')
    await supabase.from('orders').delete().eq('id', orderId)
    toast.success('Order dihapus')
    setOrders(prev => prev.filter(o => o.id !== orderId))
    setActionLoading(null)
    setDeleteConfirm(null)
  }

  const filteredOrders = orders

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Orders Management</h1>
          <p className="text-slate-500 mt-0.5">{orders.length} orders</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex gap-1 flex-wrap">
          <span className="text-xs text-slate-500 self-center mr-1">Payment:</span>
          {PAYMENT_STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => setFilterPayment(s)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors capitalize ${filterPayment === s ? 'bg-blue-600 text-white font-medium' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              {s === 'all' ? 'Semua' : s.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          <span className="text-xs text-slate-500 self-center mr-1">Order:</span>
          {ORDER_STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => setFilterOrder(s)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors capitalize ${filterOrder === s ? 'bg-slate-800 text-white font-medium' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
              {s === 'all' ? 'Semua' : s}
            </button>
          ))}
        </div>
      </div>

      <Card className="bg-white border-slate-200">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-16 text-center text-slate-400">Tidak ada order ditemukan</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Order</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Customer</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Items</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Total</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Payment</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Order</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Bukti</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map(order => {
                    const isDeleting = deleteConfirm === order.id
                    return (
                      <tr key={order.id} className={`hover:bg-slate-50 transition-colors ${isDeleting ? 'bg-red-50' : ''}`}>
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-xs font-medium text-slate-900">{order.order_number || `#${order.id.slice(0, 8)}`}</span>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {new Date(order.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 text-sm text-slate-700">{order.user?.email || '-'}</td>
                        <td className="py-3.5 px-4">
                          <span className="text-xs text-slate-600 line-clamp-2 max-w-[140px]">
                            {order.order_items.map(i => i.product?.name).filter(Boolean).join(', ') || '-'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-sm text-slate-900">{formatIDR(Number(order.total_amount))}</td>
                        <td className="py-3.5 px-4">{paymentStatusBadge(order.payment_status)}</td>
                        <td className="py-3.5 px-4">{orderStatusBadge(order.order_status || order.status)}</td>
                        <td className="py-3.5 px-4">
                          {order.payment_proof ? (
                            <button onClick={() => setZoomProof(order.payment_proof)} className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-xs">
                              <Eye className="h-3.5 w-3.5" /> Lihat
                            </button>
                          ) : <span className="text-xs text-slate-400">-</span>}
                        </td>
                        <td className="py-3.5 px-4">
                          {isDeleting ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Hapus?</span>
                              <button onClick={() => deleteOrder(order.id)} className="text-xs px-2 py-1 bg-red-600 text-white rounded">Ya</button>
                              <button onClick={() => setDeleteConfirm(null)} className="text-xs px-2 py-1 bg-slate-200 text-slate-600 rounded">Batal</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {order.payment_status === 'pending_verification' && (
                                <>
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                    onClick={() => approvePayment(order.id)} disabled={!!actionLoading} title="Approve">
                                    {actionLoading === order.id + 'approve' ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle className="h-3 w-3 mr-1" />Approve</>}
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-red-200 text-red-600 hover:bg-red-50"
                                    onClick={() => { setDetailOrder(order); setShowRejectForm(true) }} disabled={!!actionLoading} title="Reject">
                                    <><XCircle className="h-3 w-3 mr-1" />Reject</>
                                  </Button>
                                </>
                              )}
                              {order.payment_status !== 'pending_verification' && order.payment_status !== 'paid' && (
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                  onClick={() => approvePayment(order.id)} disabled={!!actionLoading} title="Mark Paid">
                                  <><Check className="h-3 w-3 mr-1" />Paid</>
                                </Button>
                              )}
                              {order.order_status !== 'cancelled' && order.payment_status !== 'pending_verification' && (
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-red-200 text-red-600 hover:bg-red-50"
                                  onClick={() => updateOrderStatus(order.id, 'cancelled')} disabled={!!actionLoading}>
                                  <><X className="h-3 w-3 mr-1" />Cancel</>
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600"
                                onClick={() => setDeleteConfirm(order.id)} disabled={!!actionLoading} title="Hapus">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-500"
                                onClick={() => setDetailOrder(order)}>
                                Detail
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

      {/* Order Detail Modal */}
      {detailOrder && !showRejectForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Detail Order</h3>
              <button onClick={() => setDetailOrder(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Order Number</span><span className="font-mono font-medium">{detailOrder.order_number}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Customer</span><span>{detailOrder.user?.email || '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="font-bold">{formatIDR(Number(detailOrder.total_amount))}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Payment Status</span>{paymentStatusBadge(detailOrder.payment_status)}</div>
              <div className="flex justify-between"><span className="text-slate-500">Order Status</span>{orderStatusBadge(detailOrder.order_status || detailOrder.status)}</div>
              {detailOrder.payment_account && (
                <>
                  <div className="flex justify-between"><span className="text-slate-500">Metode Bayar</span><span>{detailOrder.payment_account.payment_name}</span></div>
                  {detailOrder.payment_account.bank_name && <div className="flex justify-between"><span className="text-slate-500">Bank/E-Wallet</span><span>{detailOrder.payment_account.bank_name}</span></div>}
                  {detailOrder.payment_account.account_number && <div className="flex justify-between"><span className="text-slate-500">No Rekening</span><span className="font-mono">{detailOrder.payment_account.account_number}</span></div>}
                  {detailOrder.payment_account.account_holder && <div className="flex justify-between"><span className="text-slate-500">Atas Nama</span><span>{detailOrder.payment_account.account_holder}</span></div>}
                </>
              )}
              {detailOrder.rejection_reason && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                  <p className="text-xs text-red-600 font-medium">Alasan Penolakan:</p>
                  <p className="text-sm text-red-700 mt-1">{detailOrder.rejection_reason}</p>
                </div>
              )}
              {detailOrder.payment_proof && (
                <div>
                  <p className="text-slate-500 mb-2">Bukti Pembayaran:</p>
                  <img src={detailOrder.payment_proof} alt="Bukti" className="rounded-lg border max-h-48 cursor-pointer" onClick={() => setZoomProof(detailOrder.payment_proof)} />
                </div>
              )}
              <div>
                <p className="text-slate-500 mb-1">Items:</p>
                <ul className="space-y-1">{detailOrder.order_items.map((item, i) => <li key={i} className="text-slate-700">- {item.product?.name || '-'}</li>)}</ul>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              {detailOrder.payment_status === 'pending_verification' && (
                <>
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => approvePayment(detailOrder.id)} disabled={!!actionLoading}>
                    {actionLoading === detailOrder.id + 'approve' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                    Approve Pembayaran
                  </Button>
                  <Button variant="outline" className="flex-1 border-red-200 text-red-600 hover:bg-red-50" onClick={() => setShowRejectForm(true)}>
                    <XCircle className="h-4 w-4 mr-2" />Reject
                  </Button>
                </>
              )}
              {detailOrder.payment_status !== 'pending_verification' && detailOrder.payment_status !== 'paid' && (
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => approvePayment(detailOrder.id)} disabled={!!actionLoading}>
                  <Check className="h-4 w-4 mr-2" />Konfirmasi Paid
                </Button>
              )}
              <Button variant="outline" onClick={() => setDetailOrder(null)}>Tutup</Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Form Modal */}
      {showRejectForm && detailOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-red-700">Tolak Pembayaran</h3>
              <button onClick={() => { setShowRejectForm(false); setRejectReason('') }}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <p className="text-sm text-slate-600">Order: <span className="font-mono font-medium">{detailOrder.order_number}</span></p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Alasan Penolakan <span className="text-red-500">*</span></label>
              <textarea
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-red-300"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Jelaskan alasan penolakan pembayaran..."
              />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => rejectPayment(detailOrder.id)} disabled={!!actionLoading || !rejectReason.trim()}>
                {actionLoading === detailOrder.id + 'reject' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
                Tolak Pembayaran
              </Button>
              <Button variant="outline" onClick={() => { setShowRejectForm(false); setRejectReason('') }}>Batal</Button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Zoom Modal */}
      {zoomProof && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setZoomProof(null)}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            <img src={zoomProof} alt="Bukti Pembayaran" className="max-h-[85vh] max-w-[85vw] rounded-xl" />
            <button onClick={() => setZoomProof(null)} className="absolute -top-3 -right-3 bg-white text-slate-800 rounded-full h-8 w-8 flex items-center justify-center shadow-lg">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
