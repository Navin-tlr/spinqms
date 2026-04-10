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
export const getUster = () => http.get('/uster').then(r => r.data)

// ── Utility calcs ─────────────────────────────────────────────────────────────
export const calcIrregularity = (body) => http.post('/calc/irregularity', body).then(r => r.data)
export const predictRF        = (body) => http.post('/calc/predict-rf', body).then(r => r.data)

// ── CSV export ────────────────────────────────────────────────────────────────
export const downloadCSV = () => {
  window.open('/api/export/csv', '_blank')
}

// ── Hank formula helpers (client-side mirror of logic.py) ────────────────────
export const weightToHank = (weightGrams, lengthYards) =>
  (lengthYards * 0.54) / weightGrams

export const hankToWeight = (hank, lengthYards) =>
  (lengthYards * 0.54) / hank

export const decimalPlaces = (target) => (target >= 10 ? 2 : 4)
