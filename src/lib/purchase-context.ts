'use client'

import { createBrowserClient } from '@/lib/supabase/client'

/**
 * Global Purchase Context - Single Source of Truth
 *
 * All modules MUST read from this context:
 * - Checkout
 * - Orders
 * - Order Items
 * - Payments
 * - Affiliates
 * - Commissions
 * - Licenses
 * - Downloads
 * - Components
 * - Automation
 */

export interface PurchaseContext {
  // Product Data
  product_id: string
  product_name: string
  product_slug: string
  product_image: string | null
  product_price: number

  // Variant Data
  variant_id: string | null
  variant_name: string | null
  variant_price: number | null

  // Final Price (from variant or product)
  price: number
  quantity: number
  subtotal: number
  total: number

  // Affiliate Data
  affiliate_id: string | null
  affiliate_code: string | null
  affiliate_click_id: string | null
  affiliate_source: string
  commission_rate: number | null

  // Product Features
  license_enabled: boolean
  download_enabled: boolean

  // Customer
  user_id: string | null

  // Validation
  validated: boolean
}

export interface OrderContext {
  order_id: string
  order_number: string
  user_id: string
  product_id: string
  product_name: string
  variant_id: string | null
  variant_name: string | null
  price: number
  quantity: number
  total: number
  payment_status: string
  order_status: string
  affiliate_id: string | null
  affiliate_code: string | null
  commission_amount: number | null
  license_key: string | null
  download_access: boolean
}

/**
 * Create Purchase Context from Product Purchase Action
 */
export async function createPurchaseContext(
  supabase: ReturnType<typeof createBrowserClient>,
  params: {
    productId: string
    variantId?: string | null
    affiliateCode?: string | null
    affiliateClickId?: string | null
    affiliateSource?: string
  }
): Promise<PurchaseContext> {
  const { productId, variantId, affiliateCode, affiliateClickId, affiliateSource } = params

  // Fetch product data
  const { data: product, error: productError } = await supabase
    .from('products')
    .select(`
      id, name, slug, price, image_url, variants_enabled,
      enable_license, download_enabled
    `)
    .eq('id', productId)
    .single()

  if (productError || !product) {
    // Try by slug
    const { data: bySlug } = await supabase
      .from('products')
      .select(`
        id, name, slug, price, image_url, variants_enabled,
        enable_license, download_enabled
      `)
      .eq('slug', productId)
      .single()

    if (!bySlug) {
      return createEmptyContext()
    }
    Object.assign(product, bySlug)
  }

  let finalPrice = product.price
  let variantName = null
  let activeVariantId = null

  // Handle variant
  if (variantId) {
    const { data: variant } = await supabase
      .from('product_variants')
      .select('id, name, price')
      .eq('id', variantId)
      .eq('product_id', product.id)
      .eq('is_active', true)
      .single()

    if (variant) {
      finalPrice = variant.price
      variantName = variant.name
      activeVariantId = variant.id
    }
  } else if (product.variants_enabled) {
    // No variant specified - get default or first variant
    let defaultVariant = null
    const { data: dflt } = await supabase
      .from('product_variants')
      .select('id, name, price')
      .eq('product_id', product.id)
      .eq('is_active', true)
      .eq('is_default', true)
      .single()

    if (dflt) {
      defaultVariant = dflt
    } else {
      const { data: first } = await supabase
        .from('product_variants')
        .select('id, name, price')
        .eq('product_id', product.id)
        .eq('is_active', true)
        .order('sort_order')
        .limit(1)
        .single()

      if (first) defaultVariant = first
    }

    if (defaultVariant) {
      finalPrice = defaultVariant.price
      variantName = defaultVariant.name
      activeVariantId = defaultVariant.id
    }
  }

  // Get affiliate info
  let affiliateId = null
  let commissionRate = null
  if (affiliateCode) {
    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('id, commission_rate')
      .eq('referral_code', affiliateCode)
      .eq('status', 'active')
      .single()

    if (affiliate) {
      affiliateId = affiliate.id
      commissionRate = affiliate.commission_rate
    }
  }

  return {
    product_id: product.id,
    product_name: product.name,
    product_slug: product.slug,
    product_image: product.image_url,
    product_price: product.price,
    variant_id: activeVariantId,
    variant_name: variantName,
    variant_price: activeVariantId ? finalPrice : null,
    price: finalPrice,
    quantity: 1,
    subtotal: finalPrice,
    total: finalPrice,
    affiliate_id: affiliateId,
    affiliate_code: affiliateCode || null,
    affiliate_click_id: affiliateClickId || null,
    affiliate_source: affiliateSource || 'direct',
    commission_rate: commissionRate,
    license_enabled: product.enable_license || false,
    download_enabled: product.download_enabled || false,
    user_id: null,
    validated: true
  }
}

/**
 * Create empty context for invalid/missing product
 */
export function createEmptyContext(): PurchaseContext {
  return {
    product_id: '',
    product_name: '',
    product_slug: '',
    product_image: null,
    product_price: 0,
    variant_id: null,
    variant_name: null,
    variant_price: null,
    price: 0,
    quantity: 1,
    subtotal: 0,
    total: 0,
    affiliate_id: null,
    affiliate_code: null,
    affiliate_click_id: null,
    affiliate_source: 'direct',
    commission_rate: null,
    license_enabled: false,
    download_enabled: false,
    user_id: null,
    validated: false
  }
}

/**
 * Create complete order from Purchase Context
 * This is the SINGLE function for order creation
 */
export async function createOrderFromContext(
  supabase: ReturnType<typeof createBrowserClient>,
  context: PurchaseContext,
  billingData: {
    name: string
    email: string
    phone: string
    notes?: string
  },
  paymentData: {
    payment_method: string
    payment_account_id: string
  }
): Promise<{ success: boolean; order?: OrderContext; error?: string }> {
  try {
    // Validate context
    if (!context.validated || !context.product_id || context.price <= 0) {
      return { success: false, error: 'Invalid purchase context. Product or variant not configured.' }
    }

    // Get user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'User not authenticated' }
    }

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`

    // Calculate commission if affiliate
    let commissionAmount = null
    if (context.affiliate_id && context.commission_rate) {
      commissionAmount = (context.total * context.commission_rate) / 100
    }

    // Get payment method ID
    const { data: method } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('type', 'manual')
      .limit(1)
      .single()

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        order_number: orderNumber,
        total_amount: context.total,
        status: 'pending',
        order_status: 'pending',
        payment_status: 'pending_payment',
        payment_method: paymentData.payment_method,
        payment_method_id: method?.id || null,
        payment_account_id: paymentData.payment_account_id,
        billing_name: billingData.name,
        billing_email: billingData.email,
        billing_phone: billingData.phone,
        notes: billingData.notes || null,
        // Affiliate data
        affiliate_id: context.affiliate_id,
        referral_code: context.affiliate_code,
        commission_amount: commissionAmount,
        commission_status: context.affiliate_id ? 'pending' : null
      })
      .select()
      .single()

    if (orderError || !order) {
      console.error('[Order Creation] Error:', orderError)
      return { success: false, error: 'Failed to create order' }
    }

    // Create order items
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert({
        order_id: order.id,
        product_id: context.product_id,
        variant_id: context.variant_id,
        quantity: context.quantity,
        price: context.price,
        product_name: context.product_name,
        variant_name: context.variant_name
      })

    if (itemsError) {
      console.error('[Order Items] Error:', itemsError)
    }

    // Create order timeline
    await supabase.from('order_timelines').insert({
      order_id: order.id,
      status: 'order_created',
      description: 'Order created',
      created_by: user.id
    })

    // Create activity log
    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action: 'order_created',
      entity_type: 'order',
      entity_id: order.id,
      metadata: {
        order_number: orderNumber,
        product_id: context.product_id,
        product_name: context.product_name,
        variant_id: context.variant_id,
        variant_name: context.variant_name,
        total: context.total
      }
    })

    // Track affiliate click attribution
    if (context.affiliate_id && context.affiliate_click_id) {
      await supabase
        .from('affiliate_clicks')
        .update({
          order_id: order.id,
          converted_at: new Date().toISOString()
        })
        .eq('click_id', context.affiliate_click_id)
    }

    console.log('[Order Creation] Success:', orderNumber)

    return {
      success: true,
      order: {
        order_id: order.id,
        order_number: orderNumber,
        user_id: user.id,
        product_id: context.product_id,
        product_name: context.product_name,
        variant_id: context.variant_id,
        variant_name: context.variant_name,
        price: context.price,
        quantity: context.quantity,
        total: context.total,
        payment_status: 'pending_payment',
        order_status: 'pending',
        affiliate_id: context.affiliate_id,
        affiliate_code: context.affiliate_code,
        commission_amount: commissionAmount,
        license_key: null,
        download_access: false
      }
    }
  } catch (error) {
    console.error('[Order Creation] Exception:', error)
    return { success: false, error: 'Unexpected error creating order' }
  }
}

/**
 * Process order when payment is verified
 * - Generate license if enabled
 * - Create download access if enabled
 * - Update commission status
 */
export async function processOrderOnPaymentPaid(
  supabase: ReturnType<typeof createBrowserClient>,
  orderId: string
): Promise<{ success: boolean; licenseKey?: string; error?: string }> {
  try {
    // Get order with items
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id, order_number, user_id, total_amount, payment_status,
        affiliate_id, commission_amount, commission_status,
        order_items(
          id, product_id, variant_id, product_name, variant_name,
          products(enable_license, download_enabled, name)
        )
      `)
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { success: false, error: 'Order not found' }
    }

    if (order.payment_status !== 'paid') {
      return { success: false, error: 'Order not paid' }
    }

    const orderItem = order.order_items?.[0]
    if (!orderItem) {
      return { success: false, error: 'No order items found' }
    }

    let licenseKey = null

    // Generate license if enabled
    if (orderItem.products?.enable_license) {
      const generatedKey = `LICENSE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`

      const { error: licenseError } = await supabase
        .from('licenses')
        .insert({
          user_id: order.user_id,
          order_id: order.id,
          product_id: orderItem.product_id,
          license_key: generatedKey,
          status: 'active',
          expires_at: null
        })

      if (!licenseError) {
        licenseKey = generatedKey
        console.log('[License] Generated:', generatedKey)

        // Update timeline
        await supabase.from('order_timelines').insert({
          order_id: order.id,
          status: 'license_generated',
          description: `License generated: ${generatedKey}`,
          created_by: order.user_id
        })
      }
    }

    // Create download access if enabled
    if (orderItem.products?.download_enabled) {
      const { error: downloadError } = await supabase
        .from('user_downloads')
        .insert({
          user_id: order.user_id,
          product_id: orderItem.product_id,
          order_id: order.id,
          download_count: 0,
          max_downloads: 10,
          is_disabled: false
        })

      if (!downloadError) {
        console.log('[Download] Access created')

        // Update timeline
        await supabase.from('order_timelines').insert({
          order_id: order.id,
          status: 'download_created',
          description: 'Download access granted',
          created_by: order.user_id
        })
      }
    }

    // Update commission status if affiliate
    if (order.affiliate_id && order.commission_amount) {
      await supabase
        .from('orders')
        .update({ commission_status: 'pending_payout' })
        .eq('id', order.id)

      // Create affiliate commission record
      await supabase.from('affiliate_commissions').insert({
        affiliate_id: order.affiliate_id,
        order_id: order.id,
        amount: order.commission_amount,
        status: 'pending',
        created_at: new Date().toISOString()
      })

      console.log('[Commission] Created for affiliate:', order.affiliate_id)
    }

    return { success: true, licenseKey }
  } catch (error) {
    console.error('[Process Order] Exception:', error)
    return { success: false, error: 'Unexpected error processing order' }
  }
}

/**
 * Format price to IDR
 */
export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(amount)
}
