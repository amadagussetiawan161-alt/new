'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBrowserClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const supabase = createBrowserClient()

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('site_settings').select('key, value')
      const settingsMap: Record<string, string> = {}
      data?.forEach(s => { settingsMap[s.key] = s.value || '' })
      setSettings(settingsMap)
      setLoading(false)
    }
    fetchSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    for (const [key, value] of Object.entries(settings)) {
      await supabase.from('site_settings').upsert({ key, value }, { onConflict: 'key' })
    }
    toast.success('Settings saved')
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div>
      <div className="mb-8"><h1 className="text-3xl font-bold">Site Settings</h1><p className="text-muted-foreground">Configure platform settings</p></div>

      <Card className="max-w-2xl">
        <CardHeader><CardTitle>General Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Site Name</Label>
            <Input value={settings.site_name || ''} onChange={(e) => setSettings({ ...settings, site_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Site Description</Label>
            <Input value={settings.site_description || ''} onChange={(e) => setSettings({ ...settings, site_description: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Contact Email</Label>
            <Input value={settings.contact_email || ''} onChange={(e) => setSettings({ ...settings, contact_email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Currency Symbol</Label>
            <Input value={settings.currency_symbol || '$'} onChange={(e) => setSettings({ ...settings, currency_symbol: e.target.value })} />
          </div>
          <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Settings</Button>
        </CardContent>
      </Card>
    </div>
  )
}
