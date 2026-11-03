-- Códigos por correo para recuperar la contraseña y verificar el correo (#64). Es aditiva: no borra ni cambia nada.
-- Las migraciones 20261007230000 (que creó esto en la etapa 7) y 20261020000000 (que lo retiró) se quedan como están.

-- CreateEnum
CREATE TYPE "email_code_purpose" AS ENUM ('verify_email', 'reset_password');

-- AlterTable: nula para todas. Verificar es opcional, y nadie lo ha hecho todavía.
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "email_codes" (
    "user_id" UUID NOT NULL,
    "purpose" "email_code_purpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_codes_pkey" PRIMARY KEY ("user_id","purpose")
);

-- AddForeignKey
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Los intentos de un código van de 0 a 5: la base de datos es el tope duro aunque falle cualquier otra protección.
ALTER TABLE "email_codes" ADD CONSTRAINT "email_codes_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5);
