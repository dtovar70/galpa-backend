/** User roles. Stored in the Postgres enum type "Role". */
export const Role = {
    ADMIN: 'ADMIN',
    EDITOR: 'EDITOR',
} as const

export type Role = (typeof Role)[keyof typeof Role]
