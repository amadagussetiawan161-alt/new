'use client'

import { useEffect, useState, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createBrowserClient } from '@/lib/supabase/client'
import { uploadPaymentProof } from '@/lib/supabase/storage'
import { toast } from 'sonner'
import {
  Loader2, CreditCard, Tag, Building2, Smartphone, QrCode,
  Upload, ZoomIn, X, CheckCircle2, Copy, AlertCircle
} from 'lucide-react'

interface CartItem {
  id: string
  quantity: number
  price: number
  product: { id: string; name: string; slug: string }
}

interface PaymentAccount {
  id: string
  type: 'bank_transfer' | 'ewallet' | 'qris'
  payment_name: string
  bank_name: string | null
  account_number: string | null
  account_holder: string | null
  merchant_name: string | null
  qris_image: string | null
  is_active: boolean
}

const formatIDR = (amount: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const productSlug = searchParams.get('product')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState('')
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<PaymentAccount | null>(null)
  const [couponCode, setCouponCode] = useState('')
  const [couponApplied, setCouponApplied] = useState<any>(null)
  const [discount, setDiscount] = useState(0)
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })

  // After order state
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null)
  const [createdOrderNumber, setCreatedOrderNumber] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofPreview, setProofPreview] = useState<string | null>(null)
  const [uploadingProof, setUploadingProof] = useState(false)
  const [proofUploaded, setProofUploaded] = useState(false)
  const [zoomQris, setZoomQris] = useState(false)

  const proofRef = useRef<HTMLInputElement>(null)
  const supabase = createBrowserClient()

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login?redirectTo=/checkout'); return }
      setUserId(user.id)
      if (user.email) setForm(f => ({ ...f, email: user.email! }))

      const { data: profile } = await supabase.from('profiles').select('full_name, phone').eq('user_id', user.id).single()
      if (profile) setForm(f => ({ ...f, name: profile.full_name || '', phone: profile.phone || '' }))

      // Fetch active payment accounts
      const { data: accounts } = await supabase.from('payment_accounts').select('*').eq('is_active', true).order('type').order('created_at')
      const activeAccounts = (accounts || []) as PaymentAccount[]
      setPaymentAccounts(activeAccounts)
      if (activeAccounts.length > 0) setSelectedAccount(activeAccounts[0])

      // Load cart
      if (productSlug) {
        const { data: product } = await supabase.from('products').select('id, name, slug, price').eq('slug', productSlug).single()
        if (product) setCartItems([{ id: product.id, quantity: 1, price: product.price, product }])
      } else {
        const { data } = await supabase.from('cart_items').select('id, quantity, price, product:products(id, name, slug)').eq('user_id', user.id)
        const formatted: CartItem[] = (data as any[])?.map(row => ({
          id: row.id, quantity: row.quantity, price: row.price,
          product: Array.isArray(row.product) ? row.product[0] : row.product
        })) || []
        setCartItems(formatted)
      }
      setLoading(false)
    }
    fetchData()
  }, [router, productSlug])

  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  const total = Math.max(0, subtotal - discount)

  const applyCoupon = async () => {
    if (!couponCode.trim()) return
    const { data: coupon } = await supabase.from('coupons').select('*').eq('code', couponCode.trim()).eq('is_active', true).single()
    if (!coupon) { toast.error('Kode kupon tidak valid'); return }
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) { toast.error('Batas pemakaian kupon sudah habis'); return }
    if (coupon.end_date && new Date(coupon.end_date) < new Date()) { toast.error('Kupon sudah kadaluarsa'); return }
    let disc = coupon.type === 'percentage' ? subtotal * (coupon.value / 100) : coupon.value
    if (disc > subtotal) disc = subtotal
    setCouponApplied(coupon)
    setDiscount(disc)
    toast.success(`Kupon berhasil diterapkan! Hemat ${formatIDR(disc)}`)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Disalin ke clipboard')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (cartItems.length === 0) { toast.error('Keranjang kosong'); return }
    if (!selectedAccount) { toast.error('Pilih metode pembayaran'); return }
    setSubmitting(true)

    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
    const { data: method } = await supabase.from('payment_methods').select('id').eq('type', 'manual').limit(1).single()

    const { data: order, error } = await supabase.from('orders').insert({
      user_id: userId,
      order_number: orderNumber,
      total_amount: total,
      status: 'pending',
      order_status: 'pending',
      payment_status: 'pending_payment',
      payment_method: selectedAccount.type,
      payment_method_id: method?.id || null,
      payment_account_id: selectedAccount.id,
      billing_name: form.name,
      billing_email: form.email,
      billing_phone: form.phone,
      notes: form.notes,
      coupon_id: couponApplied?.id || null,
      discount_amount: discount,
    }).select().single()

    if (error || !order) { toast.error('Gagal membuat order'); setSubmitting(false); return }

    const orderItems = cartItems.map(item => ({
      order_id: order.id, product_id: item.product.id, quantity: item.quantity, price: item.price
    }))
    await supabase.from('order_items').insert(orderItems)

    if (!productSlug) await supabase.from('cart_items').delete().eq('user_id', userId)
    if (couponApplied) await supabase.from('coupons').update({ usage_count: (couponApplied.usage_count || 0) + 1 }).eq('id', couponApplied.id)

    setCreatedOrderId(order.id)
    setCreatedOrderNumber(orderNumber)
    setSubmitting(false)
  }

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
    if (!proofFile || !createdOrderId) return
    setUploadingProof(true)
    const url = await uploadPaymentProof(proofFile, createdOrderId)
    if (!url) { toast.error('Gagal mengunggah bukti pembayaran'); setUploadingProof(false); return }
    const { error } = await supabase.from('orders').update({
      payment_proof: url,
      payment_status: 'pending_verification',
    }).eq('id', createdOrderId)
    if (error) { toast.error('Gagal menyimpan bukti'); setUploadingProof(false); return }
    setProofUploaded(true)
    setUploadingProof(false)
    toast.success('Bukti pembayaran berhasil dikirim! Admin akan memverifikasi segera.')
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>

  // --- POST ORDER: Show payment instructions ---
  if (createdOrderId) {
    if (proofUploaded) {
      return (
        <div className="max-w-lg mx-auto py-16 text-center">
          <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">Bukti Pembayaran Terkirim!</h2>
          <p className="text-slate-500 mb-2">Admin akan memverifikasi pembayaran Anda segera.</p>
          <p className="text-sm font-mono bg-slate-100 rounded px-3 py-2 inline-block mb-6">{createdOrderNumber}</p>
          <div className="flex flex-col gap-2">
            <Button asChild><a href="/dashboard/orders">Lihat Status Order</a></Button>
            <Button variant="outline" asChild><a href="/products">Lanjut Belanja</a></Button>
          </div>
        </div>
      )
    }

    return (
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 mb-4">
            <AlertCircle className="h-6 w-6 text-amber-600" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900">Selesaikan Pembayaran</h2>
          <p className="text-slate-500 mt-1">Order <span className="font-mono font-medium">{createdOrderNumber}</span> berhasil dibuat</p>
        </div>

        {selectedAccount && (
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                {selectedAccount.type === 'bank_transfer' && <Building2 className="h-4 w-4 text-blue-600" />}
                {selectedAccount.type === 'ewallet' && <Smartphone className="h-4 w-4 text-green-600" />}
                {selectedAccount.type === 'qris' && <QrCode className="h-4 w-4 text-purple-600" />}
                Instruksi Pembayaran — {selectedAccount.payment_name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(selectedAccount.type === 'bank_transfer' || selectedAccount.type === 'ewallet') && (
                <>
                  {selectedAccount.bank_name && (
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-500">{selectedAccount.type === 'bank_transfer' ? 'Nama Bank' : 'Nama E-Wallet'}</span>
                      <span className="font-medium text-slate-900">{selectedAccount.bank_name}</span>
                    </div>
                  )}
                  {selectedAccount.account_number && (
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-500">Nomor {selectedAccount.type === 'bank_transfer' ? 'Rekening' : 'Akun'}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-slate-900">{selectedAccount.account_number}</span>
                        <button onClick={() => copyToClipboard(selectedAccount.account_number!)} className="text-blue-600 hover:text-blue-700">
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                  {selectedAccount.account_holder && (
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-500">Atas Nama</span>
                      <span className="font-medium text-slate-900">{selectedAccount.account_holder}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <span className="text-sm text-blue-700 font-medium">Total Transfer</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-blue-900">{formatIDR(total)}</span>
                      <button onClick={() => copyToClipboard(String(total))} className="text-blue-600 hover:text-blue-700">
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {selectedAccount.type === 'qris' && selectedAccount.qris_image && (
                <div className="text-center space-y-3">
                  <div className="relative inline-block">
                    <img src={selectedAccount.qris_image} alt="QRIS" className="h-64 w-64 object-contain border rounded-xl mx-auto" />
                    <button onClick={() => setZoomQris(true)} className="absolute top-2 right-2 bg-white shadow rounded-lg p-1.5 text-slate-600 hover:bg-slate-50">
                      <ZoomIn className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-sm text-slate-600">Scan QR code di atas dengan aplikasi pembayaran Anda</p>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <span className="text-sm text-blue-700 font-medium">Total: </span>
                    <span className="font-bold text-blue-900">{formatIDR(total)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Upload Proof */}
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base font-medium">Upload Bukti Pembayaran</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!proofPreview ? (
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors" onClick={() => proofRef.current?.click()}>
                <Upload className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm text-slate-500">Klik untuk upload bukti pembayaran</p>
                <p className="text-xs text-slate-400 mt-1">JPG, PNG, WEBP — max 5 MB</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative inline-block">
                  <img src={proofPreview} alt="Bukti" className="h-48 object-contain border rounded-lg" />
                  <button onClick={() => { setProofFile(null); setProofPreview(null); if (proofRef.current) proofRef.current.value = '' }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full h-5 w-5 flex items-center justify-center">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
            <input ref={proofRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handleProofFile} />
            <Button onClick={handleUploadProof} disabled={!proofFile || uploadingProof} className="w-full">
              {uploadingProof ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Mengunggah...</> : <><Upload className="h-4 w-4 mr-2" />Kirim Bukti Pembayaran</>}
            </Button>
            <p className="text-xs text-slate-400 text-center">Pesanan Anda akan diproses setelah admin memverifikasi pembayaran</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // --- QRIS ZOOM ---
  const qrisZoomModal = zoomQris && selectedAccount?.qris_image && (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setZoomQris(false)}>
      <div className="relative" onClick={e => e.stopPropagation()}>
        <img src={selectedAccount.qris_image} alt="QRIS" className="max-h-[85vh] max-w-[85vw] rounded-xl" />
        <button onClick={() => setZoomQris(false)} className="absolute -top-3 -right-3 bg-white text-slate-800 rounded-full h-8 w-8 flex items-center justify-center shadow-lg">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

  const accountTypeIcon = (type: string) => {
    if (type === 'bank_transfer') return <Building2 className="h-4 w-4" />
    if (type === 'ewallet') return <Smartphone className="h-4 w-4" />
    return <QrCode className="h-4 w-4" />
  }

  const accountTypeLabel = (type: string) => {
    if (type === 'bank_transfer') return 'Bank Transfer'
    if (type === 'ewallet') return 'E-Wallet'
    return 'QRIS'
  }

  return (
    <>
      {qrisZoomModal}
      <div className="max-w-4xl mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Checkout</h1>
          <p className="text-slate-500 mt-1">Selesaikan pesanan Anda</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              {/* Billing Info */}
              <Card>
                <CardHeader><CardTitle className="text-base">Informasi Billing</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div><Label>Nama Lengkap</Label><Input className="mt-1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                  <div><Label>Email</Label><Input className="mt-1" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
                  <div><Label>No. Telepon</Label><Input className="mt-1" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                  <div><Label>Catatan</Label><textarea className="mt-1 w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Catatan opsional..." /></div>
                </CardContent>
              </Card>

              {/* Payment Method Selection */}
              <Card>
                <CardHeader><CardTitle className="text-base">Metode Pembayaran</CardTitle></CardHeader>
                <CardContent>
                  {paymentAccounts.length === 0 ? (
                    <div className="text-center py-6 text-slate-500">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm">Belum ada metode pembayaran yang tersedia. Silakan hubungi admin.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {paymentAccounts.map(account => (
                        <label key={account.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedAccount?.id === account.id ? 'border-blue-500 bg-blue-50/60' : 'border-slate-200 hover:border-slate-300'}`}>
                          <input type="radio" name="payment_account" value={account.id} checked={selectedAccount?.id === account.id} onChange={() => setSelectedAccount(account)} className="h-4 w-4 text-blue-600" />
                          <div className={`p-1.5 rounded-lg ${selectedAccount?.id === account.id ? 'text-blue-600 bg-blue-100' : 'text-slate-500 bg-slate-100'}`}>
                            {accountTypeIcon(account.type)}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-sm text-slate-900">{account.payment_name}</p>
                            <p className="text-xs text-slate-500">{accountTypeLabel(account.type)}{account.bank_name ? ` — ${account.bank_name}` : ''}</p>
                          </div>
                          {account.type === 'qris' && account.qris_image && (
                            <img src={account.qris_image} alt="QR" className="h-10 w-10 object-contain rounded" />
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Order Summary */}
            <div>
              <Card className="sticky top-4">
                <CardHeader><CardTitle className="text-base">Ringkasan Order</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {cartItems.map(item => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-slate-600">{item.product.name} ×{item.quantity}</span>
                      <span className="font-medium">{formatIDR(item.price * item.quantity)}</span>
                    </div>
                  ))}

                  <div className="flex gap-2 pt-2">
                    <Input placeholder="Kode kupon" value={couponCode} onChange={e => setCouponCode(e.target.value)} disabled={!!couponApplied} className="text-sm" />
                    <Button type="button" variant="outline" size="sm" onClick={applyCoupon} disabled={!!couponApplied}>
                      <Tag className="h-4 w-4 mr-1" />Apply
                    </Button>
                  </div>
                  {couponApplied && <p className="text-sm text-emerald-600">Kupon diterapkan: -{formatIDR(discount)}</p>}

                  <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span>{formatIDR(subtotal)}</span></div>
                    {discount > 0 && <div className="flex justify-between text-sm text-emerald-600"><span>Diskon</span><span>-{formatIDR(discount)}</span></div>}
                    <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatIDR(total)}</span></div>
                  </div>

                  <Button type="submit" className="w-full" size="lg" disabled={submitting || paymentAccounts.length === 0}>
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                    Bayar Sekarang
                  </Button>

                  {selectedAccount && (
                    <p className="text-xs text-center text-slate-400">
                      Pembayaran via <span className="font-medium">{selectedAccount.payment_name}</span>
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>}>
      <CheckoutContent />
    </Suspense>
  )
}
