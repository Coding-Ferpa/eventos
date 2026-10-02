import { describe, expect, it } from 'vitest'

import { navegadorEmbutido } from './navegador-embutido'

// User agents reais, como chegam ao servidor.
const INSTAGRAM_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-S918B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 Instagram 300.0.0.29.110 Android (33/13; 450dpi; 1080x2340; samsung; SM-S918B; dm3q; qcom; pt_BR; 515038284)'
const INSTAGRAM_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.23.114 (iPhone14,5; iOS 17_0; pt_BR; pt; scale=3.00; 1170x2532; 518092734)'
const FACEBOOK_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/435.0.0.37.106;FBBV/543519612;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.0;FBSS/3;FBID/phone;FBLC/pt_BR;FBOP/5]'
const FACEBOOK_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-A536E Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.5845.163 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/432.0.0.29.102;]'
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1'

describe('navegadorEmbutido (docs 02 e 03)', () => {
  it.each([
    [INSTAGRAM_ANDROID, 'Instagram'],
    [INSTAGRAM_IOS, 'Instagram'],
    [FACEBOOK_IOS, 'Facebook'],
    [FACEBOOK_ANDROID, 'Facebook'],
  ])('reconhece o navegador do app (%#)', (ua, app) => {
    expect(navegadorEmbutido(ua)).toBe(app)
  })

  it('não incomoda quem já está no navegador de verdade', () => {
    expect(navegadorEmbutido(CHROME_ANDROID)).toBeNull()
    expect(navegadorEmbutido(SAFARI_IOS)).toBeNull()
    expect(navegadorEmbutido('')).toBeNull()
  })
})
