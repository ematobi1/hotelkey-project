import { v4 as uuidv4 } from 'uuid'
import type { CloudEvent } from '@hotel-key/types'

export function createCloudEvent<T>(
  type: string,
  source: string,
  tenantId: string,
  data: T,
): CloudEvent<T> {
  return {
    specversion: '1.0',
    id: uuidv4(),
    source,
    type,
    time: new Date().toISOString(),
    datacontenttype: 'application/json',
    tenantid: tenantId,
    data,
  }
}
