'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createBrowserClient } from '@/lib/supabase/client'
import { uploadPaymentProof } from '@/lib/supabase/storage'
import { Loader2, Package, Upload, X, Eye, ZoomIn, AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react'
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
  order_items: { id: string; product: { name: string } }[]
  payment_account: {
    payment_name: string
    type: string
    bank_name: string | null
    account_number: string | null
    account_holder: string | null
    qris_image: string | null
  } | null
}

const formatIDR = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)

const paymentStatusBadge = (status: string) => {
  switch (status) {
    case 'paid': return <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-0">Paid</Badge>
    case 'pending_payment': return <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border-0">Pending Payment</Badge>
    case 'pending_verification': return <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 border-0">Pending Verification</Badge>
    case 'rejected': return <Badge className="bg-red-50 text-red-700 hover:bg-red-50 border-0">Rejected</Badge>
    default: return <Badge variant="secondary">{status || 'pending'}</Badge>
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

const statusSteps = [
  { key: 'pending_payment', label: 'Menunggu Pembayaran', icon: Clock },
  { key: 'pending_verification', label: 'Verifikasi', icon: Eye },
  { key: 'paid', label: 'Pembayaran Dikonfirmasi', icon: CheckCircle2 },
  { key: 'processing', label: 'Diproses', icon: Package },
  { key: 'completed', label: 'Selesai', icon: CheckCircle2 },
]

const stepIndex = (status: string) => {
  const map: Record<string, number> = {
    pending_payment: 0,
    pending_verification: 1,
    paid: 2,
    processing: 3,
    completed: 4,
    rejected: -1,
    cancelled: -1,
  }
  return map[status] ?? 0
}

export default function OrdersPage() {
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofPreview, setProofPreview] = useState<string | null>(null)
  const [uploadingProof, setUploadingProof] = useState(false)
  const [zoomImage, setZoomImage] = useState<string | null>(null)
  const proofRef = useRef<HTMLInputElement>(null)
  const supabase = createBrowserClient()

  useEffect(() => {
    const fetchOrders = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('orders')
        .select(`
          id, order_number, total_amount, status, payment_status, order_status,
          payment_method, payment_proof, rejection_reason, created_at,
          order_items(id, product:products(name)),
          payment_account:payment_accounts(payment_name, type, bank_name, account_number, account_holder, qris_image)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
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
        order_items: (row.order_items || []).map((item: any) => ({
          id: item.id,
          product: Array.isArray(item.product) ? item.product[0] : item.product
        })),
        payment_account: Array.isArray(row.payment_account) ? row.payment_account[0] : row.payment_account,
      })) || []
      setOrders(formatted)
      setLoading(false)
    }
    fetchOrders()
  }, [])

  const handleProofFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) { toast.error('Format tidak didukung. Gunakan JPG, PNG, atau WEBP'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Ukuran file maksimal 5 MB'); return }
    setProofFile(file)
    setProofPreview(URL.createObjectURL(file))
  }

  const handleUploadProof = async () => {
    if (!proofFile || !selectedOrder) return
    setUploadingProof(true)
    const url = await uploadPaymentProof(proofFile, selectedOrder.id)
    if (!url) { toast.error('Gagal mengunggah bukti'); setUploadingProof(false); return }
    const { error } = await supabase.from('orders').update({
      payment_proof: url,
      payment_status: 'pending_verification',
    }).eq('id', selectedOrder.id)
    if (error) { toast.error('Gagal menyimpan bukti'); setUploadingProof(false); return }
    toast.success('Bukti pembayaran terkirim! Admin akan segera memverifikasi.')
    setUploadingProof(false)
    setProofFile(null)
    setProofPreview(null)
    setOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, payment_proof: url, payment_status: 'pending_verification' } : o))
    setSelectedOrder(prev => prev ? { ...prev, payment_proof: url, payment_status: 'pending_verification' } : null)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">My Orders</h1>
        <p className="text-slate-500 mt-1">{orders.length} order</p>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">Belum ada order</h3>
            <p className="text-muted-foreground mb-4">Mulai belanja untuk melihat pesanan Anda di sini</p>
            <Link href="/products"><Button>Jelajahi Produk</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
            const pStatus = order.payment_status || 'pending_payment'
            const oStatus = order.order_status || order.status || 'pending'
            const isRejected = pStatus === 'rejected'
            const canUploadProof = pStatus === 'pending_payment' || pStatus === 'rejected'

            return (
              <Card key={order.id} className="border-slate-200">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between flex-wrap gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap mb-2">
                        <span className="font-mono font-medium text-slate-900 text-sm">{order.order_number || `#${order.id.slice(0, 8)}`}</span>
                        {paymentStatusBadge(pStatus)}
                        {orderStatusBadge(oStatus)}
                      </div>
                      <p className="text-sm text-slate-600 mb-1">
                        {order.order_items?.map((item, i) => (
                          <span key={item.id}>{item.product?.name}{i < order.order_items.length - 1 ? ', ' : ''}</span>
                        ))}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(order.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {order.payment_account && ` · ${order.payment_account.payment_name}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg text-slate-900">{formatIDR(Number(order.total_amount))}</p>
                      <Button size="sm" variant="outline" className="mt-2" onClick={() => setSelectedOrder(order)}>
                        Detail
                      </Button>
                    </div>
                  </div>

                  {/* Rejected notice */}
                  {isRejected && order.rejection_reason && (
                    <div className="mt-3 bg-red-50 border border-red-100 rounded-lg p-3 flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-red-700">Pembayaran Ditolak</p>
                        <p className="text-xs text-red-600 mt-0.5">{order.rejection_reason}</p>
                      </div>
                    </div>
                  )}

                  {/* Progress tracker */}
                  {!isRejected && pStatus !== 'rejected' && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="flex items-center gap-0">
                        {statusSteps.slice(0, 4).map((step, i) => {
                          const current = stepIndex(pStatus === 'paid' ? 'paid' : pStatus === 'pending_verification' ? 'pending_verification' : pStatus === 'pending_payment' ? 'pending_payment' : oStatus === 'processing' ? 'processing' : pStatus)
                          const done = i <= current
                          return (
                            <div key={step.key} className="flex items-center flex-1">
                              <div className={`h-2 w-2 rounded-full shrink-0 ${done ? 'bg-blue-500' : 'bg-slate-200'}`} />
                              {i < 3 && <div className={`h-0.5 flex-1 mx-1 ${i < current ? 'bg-blue-500' : 'bg-slate-200'}`} />}
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex justify-between mt-1">
                        {['Pending', 'Verifikasi', 'Paid', 'Diproses'].map((label, i) => {
                          const current = stepIndex(pStatus === 'paid' ? 'paid' : pStatus === 'pending_verification' ? 'pending_verification' : pStatus === 'pending_payment' ? 'pending_payment' : pStatus)
                          return <span key={label} className={`text-xs ${i <= current ? 'text-blue-600 font-medium' : 'text-slate-400'}`}>{label}</span>
                        })}
                      </div>
                    </div>
                  )}

                  {/* Inline proof upload for pending_payment */}
                  {canUploadProof && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-xs font-medium text-slate-700 mb-2">
                        {isRejected ? 'Upload ulang bukti pembayaran:' : 'Upload bukti pembayaran:'}
                      </p>
                      <Button size="sm" variant="outline" onClick={() => setSelectedOrder(order)} className="h-8 text-xs">
                        <Upload className="h-3 w-3 mr-1" />Upload Bukti
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Detail Order</h3>
              <button onClick={() => { setSelectedOrder(null); setProofFile(null); setProofPreview(null) }}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Order Number</span><span className="font-mono font-medium">{selectedOrder.order_number}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total</span><span className="font-bold">{formatIDR(Number(selectedOrder.total_amount))}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Payment</span>{paymentStatusBadge(selectedOrder.payment_status || 'pending_payment')}</div>
              <div className="flex justify-between"><span className="text-slate-500">Order</span>{orderStatusBadge(selectedOrder.order_status || selectedOrder.status)}</div>
              {selectedOrder.payment_account && (
                <>
                  <div className="flex justify-between"><span className="text-slate-500">Metode</span><span>{selectedOrder.payment_account.payment_name}</span></div>
                  {selectedOrder.payment_account.bank_name && <div className="flex justify-between"><span className="text-slate-500">Bank/E-Wallet</span><span>{selectedOrder.payment_account.bank_name}</span></div>}
                  {selectedOrder.payment_account.account_number && <div className="flex justify-between"><span className="text-slate-500">Nomor</span><span className="font-mono">{selectedOrder.payment_account.account_number}</span></div>}
                  {selectedOrder.payment_account.account_holder && <div className="flex justify-between"><span className="text-slate-500">Atas Nama</span><span>{selectedOrder.payment_account.account_holder}</span></div>}
                  {selectedOrder.payment_account.qris_image && (
                    <div>
                      <p className="text-slate-500 mb-2">QRIS:</p>
                      <div className="relative inline-block">
                        <img src={selectedOrder.payment_account.qris_image} alt="QRIS" className="h-40 object-contain border rounded-lg cursor-pointer" onClick={() => setZoomImage(selectedOrder.payment_account!.qris_image)} />
                        <button className="absolute top-2 right-2 bg-white shadow rounded p-1" onClick={() => setZoomImage(selectedOrder.payment_account!.qris_image)}>
                          <ZoomIn className="h-3.5 w-3.5 text-slate-600" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {selectedOrder.rejection_reason && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-700">Alasan Penolakan:</p>
                  <p className="text-sm text-red-600 mt-1">{selectedOrder.rejection_reason}</p>
                </div>
              )}

              {selectedOrder.payment_proof && (
                <div>
                  <p className="text-slate-500 mb-2">Bukti Pembayaran:</p>
                  <img src={selectedOrder.payment_proof} alt="Bukti" className="h-32 object-contain border rounded-lg cursor-pointer" onClick={() => setZoomImage(selectedOrder.payment_proof)} />
                </div>
              )}
            </div>

            {/* Proof Upload - only if pending or rejected */}
            {(selectedOrder.payment_status === 'pending_payment' || selectedOrder.payment_status === 'rejected') && (
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-medium text-slate-700">
                  {selectedOrder.payment_status === 'rejected' ? 'Upload Ulang Bukti Pembayaran' : 'Upload Bukti Pembayaran'}
                </p>
                {!proofPreview ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-lg p-5 text-center cursor-pointer hover:border-blue-400 transition-colors" onClick={() => proofRef.current?.click()}>
                    <Upload className="h-6 w-6 mx-auto mb-1 text-slate-300" />
                    <p className="text-xs text-slate-500">Klik untuk upload</p>
                    <p className="text-xs text-slate-400">JPG, PNG, WEBP — max 5MB</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative inline-block">
                      <img src={proofPreview} alt="Preview" className="h-36 object-contain border rounded-lg" />
                      <button onClick={() => { setProofFile(null); setProofPreview(null); if (proofRef.current) proofRef.current.value = '' }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full h-5 w-5 flex items-center justify-center">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )}
                <input ref={proofRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handleProofFile} />
                <Button onClick={handleUploadProof} disabled={!proofFile || uploadingProof} className="w-full">
                  {uploadingProof ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Mengunggah...</> : <><Upload className="h-4 w-4 mr-2" />Kirim Bukti</>}
                </Button>
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={() => { setSelectedOrder(null); setProofFile(null); setProofPreview(null) }}>
              Tutup
            </Button>
          </div>
        </div>
      )}

      {/* Zoom Modal */}
      {zoomImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4" onClick={() => setZoomImage(null)}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            <img src={zoomImage} alt="Zoom" className="max-h-[85vh] max-w-[85vw] rounded-xl" />
            <button onClick={() => setZoomImage(null)} className="absolute -top-3 -right-3 bg-white text-slate-800 rounded-full h-8 w-8 flex items-center justify-center shadow-lg">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
