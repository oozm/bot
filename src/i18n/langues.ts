/**
 * Langues proposees et regle de choix. Volontairement sans DOM ni Vue : le
 * navigateur ne rentre que par les arguments, donc la regle se teste sans
 * simuler `navigator` ni `localStorage`.
 */

/**
 * `tag` est l'etiquette BCP 47, pas l'identifiant : elle sert a `Intl` et a
 * l'attribut `lang` du document. `zh` seul ne dit pas si l'ecriture est
 * simplifiee ou traditionnelle, d'ou `zh-Hans`.
 *
 * `nom` est l'endonyme — le nom de la langue DANS cette langue. Une liste de
 * langues traduite serait absurde : on la lit justement quand on ne comprend
 * pas la langue affichee.
 */
export const LANGUES = [
  { id: 'zh', tag: 'zh-Hans', emoji: '🇨🇳', nom: '简体中文' },
  { id: 'fr', tag: 'fr', emoji: '🇫🇷', nom: 'Français' },
  { id: 'en', tag: 'en', emoji: '🇬🇧', nom: 'English' },
] as const

export type Langue = (typeof LANGUES)[number]['id']

export const LANGUE_PAR_DEFAUT: Langue = 'fr'

export function estLangue(valeur: string | null | undefined): valeur is Langue {
  return LANGUES.some((l) => l.id === valeur)
}

export function tagDe(langue: Langue): string {
  return LANGUES.find((l) => l.id === langue)!.tag
}


export function choisirLangue(
  memorisee: string | null,
  preferences: readonly string[],
): Langue {
  if (estLangue(memorisee)) return memorisee
  for (const tag of preferences) {
    let base: string
    try {
      base = new Intl.Locale(tag).language
    } catch {
      // une etiquette invalide dans navigator.languages n'a pas a tout casser
      continue
    }
    if (estLangue(base)) return base
  }
  return LANGUE_PAR_DEFAUT
}
