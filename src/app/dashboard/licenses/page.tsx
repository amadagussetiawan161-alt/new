'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createBrowserClient } from '@/lib/supabase/client'
import { Loader2, Key } from 'lucide-react'

interface LicenseItem {
  id: string
  product_name: string
  license_key: string
  status: string
  expires_at: string | null
  created_at: string
}

export default function LicensesPage() {
  const [loading, setLoading] = useState(true)
  const [licenses, setLicenses] = useState<LicenseItem[]>([])
  const supabase = createBrowserClient()

  useEffect(() => {
    const fetchLicenses = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('user_licenses')
        .select('id, license_key, status, expires_at, created_at, product:products(name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      const formatted = (data || []).map((d: any) => ({
        id: d.id,
        product_name: d.product?.name || 'Unknown Product',
        license_key: d.license_key,
        status: d.status,
        expires_at: d.expires_at,
        created_at: d.created_at,
      }))

      setLicenses(formatted)
      setLoading(false)
    }
    fetchLicenses()
  }, [])

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">My Licenses</h1>
      <p className="text-muted-foreground mb-8">View your product licenses</p>

      {licenses.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No licenses found.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {licenses.map((license) => (
            <Card key={license.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{license.product_name}</h3>
                  <Badge variant={license.status === 'active' ? 'default' : 'secondary'}>{license.status}</Badge>
                </div>
                <div className="bg-muted rounded p-3 font-mono text-sm mb-2">{license.license_key}</div>
                <div className="text-sm text-muted-foreground">
                  {license.expires_at ? `Expires: ${new Date(license.expires_at).toLocaleDateString()}` : 'Lifetime License'}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
