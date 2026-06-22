'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createBrowserClient } from '@/lib/supabase/client'
import { Loader2, Download, Package } from 'lucide-react'
import { toast } from 'sonner'

interface DownloadItem {
  id: string
  product_id: string
  product_name: string
  product_slug: string
  download_count: number
  max_downloads: number
  last_downloaded_at: string | null
  purchase_date: string
  download_type: string | null
  download_file: string | null
  download_url: string | null
}

export default function DownloadsPage() {
  const [loading, setLoading] = useState(true)
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const supabase = createBrowserClient()

  useEffect(() => {
    const fetchDownloads = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: orders } = await supabase
        .from('orders')
        .select('id, created_at')
        .eq('user_id', user.id)
        .eq('status', 'paid')

      if (!orders || orders.length === 0) { setLoading(false); return }

      const orderIds = orders.map(o => o.id)
      const { data: items } = await supabase
        .from('order_items')
        .select('product_id')
        .in('order_id', orderIds)

      if (!items || items.length === 0) { setLoading(false); return }

      const productIds = [...new Set(items.map(i => i.product_id))]

      const { data: products } = await supabase
        .from('products')
        .select('id, name, slug, download_type, download_file, download_url')
        .in('id', productIds)
        .not('download_type', 'is', null)

      if (!products) { setLoading(false); return }

      const { data: userDownloads } = await supabase
        .from('user_downloads')
        .select('*')
        .eq('user_id', user.id)
        .in('product_id', productIds)

      const downloadMap = new Map(userDownloads?.map(d => [d.product_id, d]) || [])

      const result: DownloadItem[] = products.map(p => {
        const ud = downloadMap.get(p.id)
        return {
          id: ud?.id || p.id,
          product_id: p.id,
          product_name: p.name,
          product_slug: p.slug,
          download_count: ud?.download_count || 0,
          max_downloads: ud?.max_downloads || 10,
          last_downloaded_at: ud?.last_downloaded_at || null,
          purchase_date: orders[0].created_at,
          download_type: p.download_type,
          download_file: p.download_file,
          download_url: p.download_url,
        }
      })

      setDownloads(result)
      setLoading(false)
    }
    fetchDownloads()
  }, [])

  const handleDownload = async (item: DownloadItem) => {
    if (item.download_count >= item.max_downloads) {
      toast.error('Download limit reached')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Please login'); return }

    let url = ''
    if (item.download_type === 'file_upload' && item.download_file) {
      const { data } = supabase.storage.from('product-downloads').getPublicUrl(item.download_file)
      url = data.publicUrl
    } else if (item.download_type === 'external_url' && item.download_url) {
      url = item.download_url
    }

    if (!url) { toast.error('Download not available'); return }

    window.open(url, '_blank')

    await supabase.from('user_downloads').upsert({
      user_id: user.id,
      product_id: item.product_id,
      download_count: item.download_count + 1,
      last_downloaded_at: new Date().toISOString(),
    }, { onConflict: 'user_id,product_id' })

    setDownloads(prev => prev.map(d => d.product_id === item.product_id ? { ...d, download_count: d.download_count + 1, last_downloaded_at: new Date().toISOString() } : d))
    toast.success('Download started')
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">My Downloads</h1>
      <p className="text-muted-foreground mb-8">Access your purchased digital products</p>

      {downloads.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No downloads available. Purchase a product to get access.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {downloads.map((item) => (
            <Card key={item.product_id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{item.product_name}</h3>
                  <p className="text-sm text-muted-foreground">Purchased: {new Date(item.purchase_date).toLocaleDateString()}</p>
                  <p className="text-sm text-muted-foreground">Downloads: {item.download_count} / {item.max_downloads}</p>
                </div>
                <Button onClick={() => handleDownload(item)} disabled={item.download_count >= item.max_downloads}>
                  <Download className="h-4 w-4 mr-2" />
                  {item.download_count >= item.max_downloads ? 'Limit Reached' : 'Download'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
