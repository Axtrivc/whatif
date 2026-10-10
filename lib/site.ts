/** 生产域名单一来源 — 全站 URL、metadata、水印统一引用, 换域名只改这里。
 *  注: lib/i18n.ts 的 footerNote 与 scripts/submit-urls.mjs 的缺省 SITE_URL
 *  仍带域名字面量(前者是文案, 后者是 .mjs 不能 import TS), 换域名时需一并 grep 旧域名。 */
export const SITE_HOST = 'whatif.axtrivc.com';
export const SITE_URL = `https://${SITE_HOST}`;
