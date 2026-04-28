/**
 * api.js — All communication with the FastAPI backend.
 * All paths are relative → Vite proxies /api/* to http://localhost:8000
 */

import axios from 'axios'

const http = axios.create({ baseURL: '/api' })

// ── Settings ──────────────────────────────────────────────────────────────────
export const getSettings    = ()              => http.get('/settings').then(r => r.data)
export const updateSettings = (deptId, body) => http.put(`/settings/${deptId}`, body).then(r => r.data)
export const resetSettings  = ()             => http.post('/settings/reset').then(r => r.data)

// ── Department definitions ────────────────────────────────────────────────────
export const getDepts = () => http.get('/depts').then(r => r.data)

// ── Samples ───────────────────────────────────────────────────────────────────
// body may include an optional `recorded_at` ISO-8601 string for historical entry
export const createSample = (body)                          => http.post('/samples', body).then(r => r.data)
export const getSamples   = (deptId, shift, frameNumber)    => http.get('/samples', { params: { dept_id: deptId, shift, frame_number: frameNumber ?? undefined } }).then(r => r.data)
export const getSample    = (id)                             => http.get(`/samples/${id}`).then(r => r.data)
export const updateSample = (id, body)                       => http.put(`/samples/${id}`, body).then(r => r.data)
export const clearSamples  = ()                              => http.delete('/samples')
export const deleteSample  = (id)                            => http.delete(`/samples/${id}`)

// ── Overview ──────────────────────────────────────────────────────────────────
export const getOverview = (params = {}) => {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  return http.get('/overview', { params: clean }).then(r => r.data)
}
export const getAlerts   = ()      => http.get('/alerts').then(r => r.data)

// ── Data Log ──────────────────────────────────────────────────────────────────
export const getLog = (params) => {
  // strip undefined/null values so axios doesn't send empty query params
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  return http.get('/log', { params: clean }).then(r => r.data)
}

// ── Uster ─────────────────────────────────────────────────────────────────────
export const getUster = (params = {}) => {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  return http.get('/uster', { params: clean }).then(r => r.data)
}

// ── Utility calcs ─────────────────────────────────────────────────────────────
export const calcIrregularity = (body) => http.post('/calc/irregularity', body).then(r => r.data)
export const predictRF        = (body) => http.post('/calc/predict-rf', body).then(r => r.data)

// ── CSV export ────────────────────────────────────────────────────────────────
export const downloadCSV = () => {
  window.open('/api/export/csv', '_blank')
}

// ── YarnLAB ───────────────────────────────────────────────────────────────────
export const getLabTrials          = ()                    => http.get('/lab/trials').then(r => r.data)
export const createLabTrial        = (body)                => http.post('/lab/trials', body).then(r => r.data)
export const updateLabTrial        = (id, body)            => http.put(`/lab/trials/${id}`, body).then(r => r.data)
export const deleteLabTrial        = (id)                  => http.delete(`/lab/trials/${id}`)
export const setLabBenchmarks      = (id, items)           => http.post(`/lab/trials/${id}/benchmarks`, items).then(r => r.data)
export const addLabSample          = (id, body)            => http.post(`/lab/trials/${id}/samples`, body).then(r => r.data)
export const deleteLabSample       = (trialId, sampleId)   => http.delete(`/lab/trials/${trialId}/samples/${sampleId}`)
export const getLabDashboard       = (id)                  => http.get(`/lab/trials/${id}/dashboard`).then(r => r.data)
export const getLabFlow            = (id)                  => http.get(`/lab/trials/${id}/flow`).then(r => r.data)
export const saveLabRSB            = (trialId, cans)       => http.put(`/lab/trials/${trialId}/flow/rsb`, { cans }).then(r => r.data)
export const createSimplexBobbin   = (trialId, body)       => http.post(`/lab/trials/${trialId}/flow/simplex`, body).then(r => r.data)
export const updateSimplexBobbin   = (id, body)            => http.put(`/lab/simplex/${id}`, body).then(r => r.data)
export const deleteSimplexBobbin   = (id)                  => http.delete(`/lab/simplex/${id}`)
export const createRingframeCop    = (trialId, body)       => http.post(`/lab/trials/${trialId}/flow/ringframe`, body).then(r => r.data)
export const updateRingframeCop    = (id, body)            => http.put(`/lab/ringframe/${id}`, body).then(r => r.data)
export const deleteRingframeCop    = (id)                  => http.delete(`/lab/ringframe/${id}`)
export const getLabMatrix          = (trialId)             => http.get(`/lab/trials/${trialId}/matrix`).then(r => r.data)
export const getInteractionReport  = (trialId)             => http.get(`/lab/trials/${trialId}/interaction-report`).then(r => r.data)

// ── Hank formula helpers (client-side mirror of logic.py) ────────────────────
export const weightToHank = (weightGrams, lengthYards) =>
  (lengthYards * 0.54) / weightGrams

export const hankToWeight = (hank, lengthYards) =>
  (lengthYards * 0.54) / hank

export const decimalPlaces = (target) => (target >= 10 ? 2 : 4)

// ── Production Module ─────────────────────────────────────────────────────────
export const getProductionStdRates  = ()              => http.get('/production/std-rates').then(r => r.data)
export const updateProductionStdRate = (deptId, body) => http.put(`/production/std-rates/${deptId}`, body).then(r => r.data)
export const createProductionEntry  = (body)          => http.post('/production/entries', body).then(r => r.data)
export const getProductionEntries   = (params)        => http.get('/production/entries', { params: clean(params) }).then(r => r.data)
export const deleteProductionEntry  = (id)            => http.delete(`/production/entries/${id}`)
export const getProductionDashboard = (targetDate)    => http.get('/production/dashboard', { params: clean({ target_date: targetDate }) }).then(r => r.data)

// ── Materials / Inventory / MRP / Purchasing ─────────────────────────────────
export const getMaterials              = ()                  => http.get('/materials').then(r => r.data)
export const getInventoryOverview      = ()                  => http.get('/inventory/overview').then(r => r.data)
export const getInventoryMovements     = (params = {})       => http.get('/inventory/movements', { params: clean(params) }).then(r => r.data)
export const createMaterialIssue       = (body)              => http.post('/inventory/material-issues', body).then(r => r.data)
export const getMaterialIssues         = (params = {})       => http.get('/inventory/material-issues', { params: clean(params) }).then(r => r.data)
export const updateMaterialPlanning    = (id, body)          => http.put(`/materials/${id}/planning`, body).then(r => r.data)
export const addMaterialMarketPrice    = (id, body)          => http.post(`/materials/${id}/market-prices`, body).then(r => r.data)
export const getPurchaseRecommendations = (status = 'open')  => http.get('/purchase/recommendations', { params: clean({ status }) }).then(r => r.data)
export const convertRecommendationToPO = (id, body)          => http.post(`/purchase/recommendations/${id}/convert-to-po`, body).then(r => r.data)
export const getPurchaseOrders         = ()                  => http.get('/purchase/orders').then(r => r.data)
export const receivePurchaseOrder      = (id, body)          => http.post(`/purchase/orders/${id}/receive`, body).then(r => r.data)
export const quickReceipt              = (body)              => http.post('/inventory/quick-receipt', body).then(r => r.data)

// Client-side formula mirrors (for live preview before save)
export const calcEfficiencyKg    = (stdRate, effPct, hours) =>
  Math.round(stdRate * (effPct / 100) * hours * 1000) / 1000

export const calcHankMeterKg     = (hankReading, spindleCount, ne) =>
  Math.round((hankReading * spindleCount / ne) * 0.453592 * 1000) / 1000

export const calcTheoreticalKg   = (rpm, tpi, spindles, ne, shiftMin = 480) => {
  const deliveryYpm  = rpm / (tpi * 36)
  const totalYards   = deliveryYpm * shiftMin * spindles
  return Math.round(totalYards / (ne * 840) * 0.453592 * 1000) / 1000
}
