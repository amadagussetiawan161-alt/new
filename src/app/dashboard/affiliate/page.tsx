'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createBrowserClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, Copy, Link2, MousePointer, ShoppingCart, DollarSign, Users, TrendingUp } from 'lucide-react'

export default function AffiliateDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [affiliate, setAffiliate] = useState<any>(null)
  const [referrals, setReferrals] = useState<any[]>([])
  const [stats, setStats] = useState({ clicks: 0, sales: 0, commission: 0, totalEarnings: 0 })
  const supabase = createBrowserClient()

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: aff } = await supabase.from('affiliates').select('*').eq('user_id', user.id).single()
      setAffiliate(aff)

      if (aff) {
        const { data: refs } = await supabase.from('referrals').select('*').eq('affiliate_id', aff.id).order('created_at', { ascending: false })
        setReferrals(refs || [])

        const totalCommission = (refs || []).reduce((sum, r) => sum + (r.commission_amount || 0), 0)
        const totalSales = (refs || []).filter(r => r.status === 'converted').length
        setStats({
          clicks: aff.clicks || 0,
          sales: totalSales,
          commission: totalCommission,
          totalEarnings: totalCommission,
        })
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  const joinAffiliate = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const code = `AFF-${user.id.slice(0, 8).toUpperCase()}`
    const { data, error } = await supabase.from('affiliates').insert({
      user_id: user.id,
      referral_code: code,
      status: 'active',
    }).select().single()
    if (error) toast.error('Failed to join affiliate program')
    else { toast.success('Welcome to the affiliate program!'); setAffiliate(data) }
  }

  const copyLink = () => {
    if (!affiliate) return
    const url = `${window.location.origin}?ref=${affiliate.referral_code}`
    navigator.clipboard.writeText(url)
    toast.success('Referral link copied!')
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>

  if (!affiliate) {
    return (
      <div className="text-center py-12">
        <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Affiliate Program</h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">Earn commissions by promoting products. Get your unique referral link and start earning today.</p>
        <Button onClick={joinAffiliate}>Join Affiliate Program</Button>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Affiliate Dashboard</h1>
      <p className="text-muted-foreground mb-8">Track your referrals and earnings</p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><MousePointer className="h-8 w-8 text-blue-500" /><div><p className="text-sm text-muted-foreground">Clicks</p><p className="text-2xl font-bold">{stats.clicks}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><ShoppingCart className="h-8 w-8 text-green-500" /><div><p className="text-sm text-muted-foreground">Sales</p><p className="text-2xl font-bold">{stats.sales}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><DollarSign className="h-8 w-8 text-emerald-500" /><div><p className="text-sm text-muted-foreground">Commission</p><p className="text-2xl font-bold">${stats.commission.toFixed(2)}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><Users className="h-8 w-8 text-purple-500" /><div><p className="text-sm text-muted-foreground">Referrals</p><p className="text-2xl font-bold">{referrals.length}</p></div></div></CardContent></Card>
      </div>

      <Card className="mb-8">
        <CardHeader><CardTitle>Your Referral Link</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1 bg-muted rounded-lg px-4 py-2 font-mono text-sm truncate">
              {typeof window !== 'undefined' ? `${window.location.origin}?ref=${affiliate.referral_code}` : ''}
            </div>
            <Button onClick={copyLink}><Copy className="h-4 w-4 mr-2" />Copy</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Referral History</CardTitle></CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No referrals yet. Share your link to start earning!</p>
          ) : (
            <div className="space-y-3">
              {referrals.map((ref) => (
                <div key={ref.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">{ref.referral_code}</p>
                    <p className="text-sm text-muted-foreground">{new Date(ref.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${ref.status === 'converted' ? 'text-green-600' : 'text-amber-600'}`}>{ref.status}</p>
                    {ref.commission_amount > 0 && <p className="text-sm text-green-600">+${ref.commission_amount.toFixed(2)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
