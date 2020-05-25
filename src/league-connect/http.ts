import got from 'got';
import { auth } from './auth'
import { Request, Credentials } from './index'
import { trimSlashes } from './utils'

export async function request(options: Request, credentials?: Credentials | undefined): Promise<any> {
  const creds = credentials || await auth()
  const url = trimSlashes(options.url)
  const fullUrl = `${creds.protocol}://127.0.0.1:${creds.port}${url}`
  const method = options.method
  const body = typeof options.body === "undefined" ? undefined : JSON.stringify(options.body)
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + Buffer.from(`riot:${creds.token}`).toString('base64')
  }

  return got(fullUrl, { headers, method, body, rejectUnauthorized: false });
}