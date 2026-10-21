// Deterministic output guards for agent texts (defense in depth on top of prompts, spec 3.2/3.3).
const PARTNER_CLAIM = /paynet[^.]{0,80}(партн[её]р|инвестор|инвестирует|партнерств)/iu;
const SAVINGS_PROMISE = /(гарантир\w*|обеща\w*|точно)[^.]{0,60}70\s?%|70\s?%[^.]{0,60}(гарантир\w*|экономи\w* всего|всего фот)/iu;
const UNLIMITED = /(безлимитн\w*|неограниченн\w*)[^.]{0,40}(вычислен|мощност|запрос)/iu;
const STATE_CHANGE_CLAIM = /(счет|счёт|оплат\w*)[^.]{0,40}(отмечен|помечен|подтвержден\w*)[^.]{0,20}(оплачен|paid)|(я|мы) (изменил\w*|обновил\w*|исправил\w*) (счет|счёт|роль|оценк\w*|подписк\w*)/iu;

export function salesTextProblems(text: string): string[] {
  const p: string[] = [];
  if (PARTNER_CLAIM.test(text)) p.push("UNCONFIRMED_PARTNERSHIP_CLAIM");
  if (SAVINGS_PROMISE.test(text)) p.push("UNSUPPORTED_SAVINGS_PROMISE");
  if (UNLIMITED.test(text)) p.push("UNLIMITED_COMPUTE_PROMISE");
  return p;
}

export function supportTextProblems(text: string): string[] {
  return STATE_CHANGE_CLAIM.test(text) ? ["CLAIMS_STATE_CHANGE"] : [];
}
