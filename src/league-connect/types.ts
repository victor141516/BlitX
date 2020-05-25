export interface Request {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any
}

export interface Credentials {
  name: string;
  pid: number;
  port: number;
  token: string;
  protocol: 'http' | 'https'
}

export type Effect<T = any, E extends EventResponse = any> = (data: T | null, event: E) => void
export type Dictionary<T> = {
  [key: string]: T
}

export interface EventResponse {
  uri: string,
  data: any
}