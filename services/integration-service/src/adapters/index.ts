import type { IntegrationAdapter } from '../domain/types'
import { LightspeedAdapter } from './lightspeed.adapter'
import { OracleSimphonyAdapter } from './oracle-simphony.adapter'
import { SquareAdapter } from './square.adapter'
import { AssaAbloyAdapter } from './assa-abloy.adapter'
import { DormakabaAdapter } from './dormakaba.adapter'
import { SaltoAdapter } from './salto.adapter'
import { SiteMinderAdapter } from './siteminder.adapter'
import { CloudbedsAdapter } from './cloudbeds.adapter'
import { RateGainAdapter } from './rategain.adapter'
import { GuestlineAdapter } from './guestline.adapter'
import { HijiffyAdapter } from './hijiffy.adapter'
import { WhistleAdapter } from './whistle.adapter'
import { OakyAdapter } from './oaky.adapter'
import { RoomdexAdapter } from './roomdex.adapter'
import { IdeasAdapter } from './ideas.adapter'
import { DuettoAdapter } from './duetto.adapter'
import { LodgisticsAdapter } from './lodgistics.adapter'
import { M3Adapter } from './m3.adapter'
import { EcoSmartAdapter } from './ecosmart.adapter'
import { WinnowAdapter } from './winnow.adapter'

export function buildAdapters(): IntegrationAdapter[] {
  return [
    new LightspeedAdapter(),
    new OracleSimphonyAdapter(),
    new SquareAdapter(),
    new AssaAbloyAdapter(),
    new DormakabaAdapter(),
    new SaltoAdapter(),
    new SiteMinderAdapter(),
    new CloudbedsAdapter(),
    new RateGainAdapter(),
    new GuestlineAdapter(),
    new HijiffyAdapter(),
    new WhistleAdapter(),
    new OakyAdapter(),
    new RoomdexAdapter(),
    new IdeasAdapter(),
    new DuettoAdapter(),
    new LodgisticsAdapter(),
    new M3Adapter(),
    new EcoSmartAdapter(),
    new WinnowAdapter(),
  ]
}
