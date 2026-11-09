export class HttpError extends Error {
  constructor (status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function validate (schema, data) {
  const result = schema.safeParse(data)
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new HttpError(400, '参数校验失败', details)
  }
  return result.data
}

export function requireId (raw) {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, '非法的 id')
  return id
}

export function notFound (what = '资源') {
  return new HttpError(404, `${what}不存在`)
}
