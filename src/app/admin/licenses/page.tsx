'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createBrowserClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

interface License { id: string; license_key: string; status: string; activations_count: number; user: { email: string } | null; product: { name: string } | null }
interface LicenseRow { id: string; license_key: string; status: string; activations_count: number; user: { email: string }[]; product: { name: string }[] }

export default function AdminLicensesPage() {
  const [loading, setLoading] = useState(true)
  const [licenses, setLicenses] = useState<License[]>([])
  const supabase = createBrowserClient()

  useEffect(() => {
    const fetchLicenses = async () => {
      const { data } = await supabase.from('licenses').select('id, license_key, status, activations_count, user:profiles(email), product:products(name)').order('created_at', { ascending: false })
      const formatted: License[] = (data as LicenseRow[])?.map(row => ({
        id: row.id, license_key: row.license_key, status: row.status, activations_count: row.activations_count,
        user: row.user?.[0] || null, product: row.product?.[0] || null
      })) || []
      setLicenses(formatted)
      setLoading(false)
    }
    fetchLicenses()
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-500'
      case 'expired': return 'bg-red-500/10 text-red-500'
      default: return 'bg-gray-500/10 text-gray-500'
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div>
      <div className="mb-8"><h1 className="text-3xl font-bold">Licenses</h1><p className="text-muted-foreground">{licenses.length} licenses</p></div>

      <Card>
        <CardHeader><CardTitle>All Licenses</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead><tr className="border-b"><th className="text-left py-3 px-4">License Key</th><th className="text-left py-3 px-4">Product</th><th className="text-left py-3 px-4">Customer</th><th className="text-left py-3 px-4">Activations</th><th className="text-left py-3 px-4">Status</th></tr></thead>
            <tbody>
              {licenses.map((license) => (
                <tr key={license.id} className="border-b hover:bg-muted/50">
                  <td className="py-3 px-4 font-mono text-sm">{license.license_key}</td>
                  <td className="py-3 px-4">{license.product?.name || '-'}</td>
                  <td className="py-3 px-4">{license.user?.email || '-'}</td>
                  <td className="py-3 px-4">{license.activations_count}</td>
                  <td className="py-3 px-4"><Badge className={getStatusColor(license.status)}>{license.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
