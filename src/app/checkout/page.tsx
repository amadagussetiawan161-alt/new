'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBrowserClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import { toast } from 'sonner'
import { Loader2, CreditCard, Tag } from 'lucide-react'

interface CartItem { id: string; quantity: number; price: number; product: { id: string; name: string; slug: string } }
interface CartItemRow { id: string; quantity: number; price: number; product: { id: string; name: string; slug: string }[] }

interface PaymentProvider {
  id: string
  name: string
  display_name: string
}

function CheckoutContent() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const productSlug = searchParams.get('product')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [providers, setProviders] = useState<PaymentProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [couponApplied, setCouponApplied] = useState<any>(null)
  const [discount, setDiscount] = useState(0)
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' })
  const supabase = createBrowserClient()

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login?redirectTo=/checkout'); return }
      if (user.email) setForm(f => ({ ...f, email: user.email! }))
      const { data: profile } = await supabase.from('profiles').select('full_name, phone').eq('user_id', user.id).single()
      if (profile) setForm(f => ({ ...f, name: profile.full_name || '', phone: profile.phone || '' }))

      const { data: provs } = await supabase.from('payment_providers').select('*').eq('is_enabled', true).order('sort_order')
      setProviders(provs || [])
      if (provs && provs.length > 0) setSelectedProvider(provs[0].name)

      if (productSlug) {
        const { data: product } = await supabase.from('products').select('id, name, slug, price').eq('slug', productSlug).single()
        if (product) {
          setCartItems([{ id: product.id, quantity: 1, price: product.price, product: { id: product.id, name: product.name, slug: product.slug } }])
        }
      } else {
        const { data } = await supabase.from('cart_items').select('id, quantity, price, product:products(id, name, slug)').eq('user_id', user.id)
        const formatted: CartItem[] = (data as CartItemRow[])?.map(row => ({
          id: row.id, quantity: row.quantity, price: row.price, product: row.product?.[0] || { id: '', name: '', slug: '' }
        })) || []
        setCartItems(formatted)
      }
      setLoading(false)
    }
    fetchData()
  }, [router, productSlug])

  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  const total = subtotal - discount

  const applyCoupon = async () => {
    if (!couponCode.trim()) return
    const { data: coupon } = await supabase.from('coupons').select('*').eq('code', couponCode.trim()).eq('is_active', true).single()
    if (!coupon) { toast.error('Invalid coupon code'); return }
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) { toast.error('Coupon usage limit reached'); return }
    if (coupon.end_date && new Date(coupon.end_date) < new Date()) { toast.error('Coupon has expired'); return }

    let disc = 0
    if (coupon.type === 'percentage') disc = subtotal * (coupon.value / 100)
    else disc = coupon.value
    if (disc > subtotal) disc = subtotal

    setCouponApplied(coupon)
    setDiscount(disc)
    toast.success(`Coupon applied! Saved ${disc.toFixed(2)}`)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (cartItems.length === 0) { toast.error('Cart is empty'); return }
    if (!selectedProvider) { toast.error('Please select a payment method'); return }
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`

    const { data: order, error: orderError } = await supabase.from('orders').insert({
      user_id: user.id,
      order_number: orderNumber,
      total_amount: total,
      status: 'pending',
      payment_method: selectedProvider,
      notes: form.notes,
      coupon_id: couponApplied?.id || null,
      discount_amount: discount,
    }).select().single()

    if (orderError || !order) { toast.error('Failed to create order'); setSubmitting(false); return }

    const orderItems = cartItems.map(item => ({ order_id: order.id, product_id: item.product.id, quantity: item.quantity, price: item.price }))
    await supabase.from('order_items').insert(orderItems)

    const referralCode = document.cookie.split('; ').find(r => r.startsWith('ref='))?.split('=')[1]
    if (referralCode) {
      const { data: affiliate } = await supabase.from('affiliates').select('id, user_id, referral_code').eq('referral_code', referralCode).single()
      if (affiliate) {
        await supabase.from('orders').update({ referral_code: referralCode, affiliate_id: affiliate.user_id }).eq('id', order.id)
      }
    }

    if (!productSlug) await supabase.from('cart_items').delete().eq('user_id', user.id)

    if (couponApplied) {
      await supabase.from('coupons').update({ usage_count: (couponApplied.usage_count || 0) + 1 }).eq('id', couponApplied.id)
    }

    if (selectedProvider === 'manual_transfer') {
      toast.success('Order placed! Please check your email for payment instructions.')
      router.push('/checkout/success?order=' + orderNumber)
    } else if (selectedProvider === 'midtrans') {
      const res = await fetch('/api/payments/midtrans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id, amount: total, customer: { name: form.name, email: form.email, phone: form.phone } }),
      })
      const data = await res.json()
      if (data.token) {
        window.snap.pay(data.token, {
          onSuccess: () => { router.push('/checkout/success?order=' + orderNumber) },
          onPending: () => { router.push('/checkout/success?order=' + orderNumber) },
          onError: () => { toast.error('Payment failed'); setSubmitting(false) },
          onClose: () => { setSubmitting(false) },
        })
      } else {
        toast.error('Failed to initialize payment')
        setSubmitting(false)
      }
    } else {
      toast.success('Order placed successfully!')
      router.push('/checkout/success?order=' + orderNumber)
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t('checkout_title', 'checkout')}</h1>
        <p className="text-muted-foreground">Complete your order</p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Billing Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Full Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-2"><Label>Notes</Label><textarea className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Payment Method</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {providers.map((p) => (
                    <label key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedProvider === p.name ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}>
                      <input type="radio" name="provider" value={p.name} checked={selectedProvider === p.name} onChange={() => setSelectedProvider(p.name)} className="h-4 w-4" />
                      <span className="font-medium">{p.display_name}</span>
                    </label>
                  ))}
                  {providers.length === 0 && <p className="text-muted-foreground text-sm">No payment providers available.</p>}
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader><CardTitle>{t('order_summary', 'checkout')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex justify-between"><span>{item.product.name} x{item.quantity}</span><span>${(item.price * item.quantity).toFixed(2)}</span></div>
                ))}

                <div className="flex gap-2 pt-2">
                  <Input placeholder="Coupon code" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} disabled={!!couponApplied} />
                  <Button type="button" variant="outline" onClick={applyCoupon} disabled={!!couponApplied}><Tag className="h-4 w-4 mr-1" />Apply</Button>
                </div>
                {couponApplied && <p className="text-sm text-green-600">Coupon applied: -${discount.toFixed(2)}</p>}

                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                  {discount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-${discount.toFixed(2)}</span></div>}
                  <div className="flex justify-between text-lg font-bold"><span>{t('total', 'checkout')}</span><span>${total.toFixed(2)}</span></div>
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                  {t('pay_now', 'checkout')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <CheckoutContent />
    </Suspense>
  )
}
