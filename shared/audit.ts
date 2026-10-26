// Constats de l'audit de données (voir src/main/services/audit.service.ts)

export interface ConstatAudit {
  severite: 'critique' | 'attention'
  categorie: string
  designation: string
  detail: string
}
