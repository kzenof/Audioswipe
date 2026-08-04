/**
 * Vercel Serverless entry — Express app.
 * Rewrites из vercel.json направляют /api/*, /ym-api/*, /ym-stream/* сюда.
 */
import app from '../server/app.js'

export default app
