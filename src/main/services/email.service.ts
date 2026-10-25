// ============================================================================
// Envoi d'emails (quittances...) via SMTP configuré par l'utilisateur dans
// les Paramètres. La config est stockée LOCALEMENT (table parametres, clé
// 'smtp'). Sans configuration, aucune fonction d'envoi n'est proposée.
// ============================================================================
import nodemailer, { Transporter } from 'nodemailer'
import { parametresRepository } from '../repositories/parametres.repository'
import type { SmtpConfig } from '@shared/types'

const CLE = 'smtp'

/** Config complète (main uniquement — le mot de passe ne part jamais au renderer). */
export function getSmtpConfig(): SmtpConfig | null {
  return parametresRepository.get<SmtpConfig>(CLE)
}

/** Config "publique" : sans le mot de passe (pour l'affichage Paramètres). */
export function getSmtpConfigPublic(): Omit<SmtpConfig, 'mot_de_passe'> & { configure: boolean } {
  const cfg = getSmtpConfig()
  if (!cfg || !cfg.host || !cfg.utilisateur) {
    return { configure: false, host: '', port: 587, secure: false, utilisateur: '', expediteur_nom: '' }
  }
  return {
    configure: true,
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    utilisateur: cfg.utilisateur,
    expediteur_nom: cfg.expediteur_nom
  }
}

export function saveSmtpConfig(cfg: SmtpConfig): void {
  parametresRepository.set(CLE, cfg)
}

function transporter(cfg: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.utilisateur, pass: cfg.mot_de_passe }
  })
}

/** Vérifie la connexion SMTP (bouton "Tester" des Paramètres). */
export async function testerSmtp(): Promise<boolean> {
  const cfg = getSmtpConfig()
  if (!cfg) throw new Error('SMTP non configuré')
  await transporter(cfg).verify()
  return true
}

/** Envoie un email avec pièce jointe PDF (base64). */
export async function envoyerEmail(
  destinataire: string,
  sujet: string,
  corps: string,
  pieceJointe?: { nomFichier: string; base64: string }
): Promise<void> {
  const cfg = getSmtpConfig()
  if (!cfg) throw new Error('SMTP non configuré — renseigne-le dans les Paramètres')
  const from = cfg.expediteur_nom
    ? `"${cfg.expediteur_nom}" <${cfg.utilisateur}>`
    : cfg.utilisateur
  await transporter(cfg).sendMail({
    from,
    to: destinataire,
    subject: sujet,
    text: corps,
    attachments: pieceJointe
      ? ({
          filename: pieceJointe.nomFichier,
          content: Buffer.from(pieceJointe.base64, 'base64'),
          contentType: 'application/pdf'
        } as never)
      : undefined
  })
}
