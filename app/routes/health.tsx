import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const startTime = Date.now();
  
  try {
    // Verificar conexión a la base de datos
    await db.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - startTime;
    
    // Verificar variables de entorno críticas
    const requiredEnvVars = [
      'SHOPIFY_API_KEY',
      'SHOPIFY_API_SECRET',
      'DATABASE_URL',
      'NODE_ENV'
    ];
    
    const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: {
          status: 'healthy',
          latency: `${dbLatency}ms`
        },
        environment: {
          status: missingEnvVars.length === 0 ? 'healthy' : 'unhealthy',
          missing: missingEnvVars
        }
      }
    };
    
    const isHealthy = healthStatus.checks.database.status === 'healthy' && 
                     healthStatus.checks.environment.status === 'healthy';
    
    return json(healthStatus, {
      status: isHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
  } catch (error) {
    return json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      checks: {
        database: {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Database connection failed'
        }
      }
    }, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }
}; 