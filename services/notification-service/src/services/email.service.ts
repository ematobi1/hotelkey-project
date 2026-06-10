import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import Handlebars from 'handlebars'
import { config } from '../config'

export interface SendEmailInput {
  to: string
  subject: string
  templateName: string
  templateData: Record<string, unknown>
}

const templates: Record<string, string> = {
  reservation_confirmation: `
    <h1>Booking Confirmed!</h1>
    <p>Dear {{guestName}},</p>
    <p>Your reservation <strong>{{confirmationCode}}</strong> is confirmed.</p>
    <p>Check-in: {{checkInDate}}</p>
    <p>Check-out: {{checkOutDate}}</p>
  `,
  welcome: `
    <h1>Welcome to {{hotelName}}!</h1>
    <p>Dear {{guestName}}, your room {{roomNumber}} is ready.</p>
  `,
  receipt: `
    <h1>Thank you for staying with us!</h1>
    <p>Dear {{guestName}}, please find your receipt for {{totalAmount}} {{currencyCode}}.</p>
  `,
}

export class EmailService {
  private readonly ses: SESClient

  constructor() {
    this.ses = new SESClient({ region: config.AWS_REGION })
  }

  async send(input: SendEmailInput): Promise<string | null> {
    const templateSource = templates[input.templateName]
    if (!templateSource) {
      throw new Error(`Email template '${input.templateName}' not found`)
    }

    const html = Handlebars.compile(templateSource)(input.templateData)

    if (config.NODE_ENV === 'development') {
      console.log('[EmailService] Dev mode — not sending email', {
        to: input.to,
        subject: input.subject,
      })
      return null
    }

    const command = new SendEmailCommand({
      Source: config.SES_FROM_ADDRESS,
      Destination: { ToAddresses: [input.to] },
      Message: {
        Subject: { Data: input.subject, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
      },
    })

    const result = await this.ses.send(command)
    return result.MessageId ?? null
  }
}
