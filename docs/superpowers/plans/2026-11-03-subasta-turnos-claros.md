# Plan propuesto: Subasta Pokémon, turnos claros (#59)

**Spec y plan aprobados por Marco el 2026-11-03.** Ejecución según la [spec](../specs/2026-11-03-subasta-turnos-claros-design.md), en el PR #70.

## 1. Reproducir los dos fallos de presentación

- Añadir una regresión en `client/test/pages/auction-battle.test.tsx` que reciba un golpe, desmonte y vuelva a montar la pantalla con el registro conservado: no debe volver a embestir.
- Añadir otra que reciba `battle-turn` seguido del `room-state` con los PS finales: debe conservar los anteriores antes del impacto.
- Ejecutar `npm exec -w client -- vitest run test/pages/auction-battle.test.tsx --testTimeout=30000 --maxWorkers=1` y observar ambos fallos por su causa concreta.
- Guardar la evidencia de la ejecución. Todavía no corregir las expectativas para acomodarlas al comportamiento actual.

## 2. Definir y probar los pasos compartidos

- Añadir primero pruebas de la función pura de secuenciación: orden, duración, entrada, preparación/impacto, notas y cierre.
- Incluir daño cero, fallos y bloqueos aunque sus datos sean contradictorios: no deben producir una embestida. Verificar que el plan no muta sus entradas y no necesita azar.
- Observar el fallo antes de implementar la función en `shared/`, sin cambiar el contrato de Socket.io.
- Añadir pruebas puras del cuadro presentado: PS antes/después del impacto, curación, retroceso, residuales, estados, stats y titular que cambia.
- Ejecutar las pruebas del cliente que consumen estas funciones hasta verlas pasar. Los PS de cada acción y el estado final del servidor son los valores esperados, no una segunda fórmula de combate.

## 3. Presentar el turno en el cliente

- Con TDD, guardar en la entrada del registro la instantánea anterior y los cambios ya revelados; mantener intacto el estado autoritativo.
- Sustituir `useStrike` por la reproducción de los pasos, con cancelación de temporizadores y sin reproducir entradas previas al montaje.
- Probar eventos duplicados/de otro asalto, salida de la pantalla, nueva sala y recuperación solo por `room-state`.
- Probar que el siguiente `room-state` no adelanta PS, estados ni titular y que la secuencia cierra en sus valores.
- Mantener el registro y el resumen del lector de pantalla una sola vez por turno.
- Volver a ejecutar las dos regresiones iniciales y las pruebas del reductor, además de la suite de `auction-battle`.

## 4. Coordinar el temporizador del servidor

- Añadir una prueba del motor que contenga cambios, acciones y notas y compruebe que aún no permite elegir justo antes de terminar la secuencia y sí avanza al vencer el plazo.
- Ver esa prueba fallar con los 3000 ms fijos. Programar el avance con la suma del plan compartido.
- Ajustar los helpers de las pruebas que asumían siempre 3 s para avanzar hasta el temporizador real; conservar las comprobaciones explícitas de frontera.
- Ejecutar `npm exec -w server -- vitest run test/game/auction.battle.test.ts test/game/auction.view.test.ts --maxWorkers=1`, con una base local propia.
- Comprobar que las pruebas existentes de partidas aleatorias, mensajes inválidos y desconexiones siguen terminando; añadir un caso de desconexión durante una secuencia con efectos si no está cubierto.
- Conservar las pruebas que impiden mostrar decisiones, PP o movimientos privados del rival. No modificar el simulador ni duplicar las reglas de `combat.ts`.

## 5. Texto y señales visuales

- Añadir primero pruebas de qué efecto corresponde a cada paso, quién lo recibe y cuándo desaparece.
- Incorporar el texto breve al escenario y las señales de estado/stat sobre el sprite afectado, manteniendo las medidas de la interfaz y la tipografía normal para cifras.
- Con reducir movimiento, usar PNG y mantener los destellos/textos; añadir las reglas concretas con `!important` al final de `client/src/index.css`.
- No integrar los efectos por tipo de #42 ni modificar las pantallas reservadas para #56–#58.

## 6. Verificación en navegador y mutaciones

- Ampliar la E2E con el orden visual de una resolución real: observar los PS antes del impacto y después, y comprobar la secuencia sin mirar el registro.
- Probar recarga durante la resolución, fin de asalto y reducir movimiento. Si una partida aleatoria no garantiza un caso, usar una prueba de presentación determinista además de la E2E, explicando su alcance.
- Mirar y registrar las animaciones con imágenes reales a 360 × 760, 375 px y escritorio, en los cuatro temas/modos. Medir las cajas, incluidos nombres largos, y comprobar que los botones se alcanzan a 360 × 760.
- Ejecutar `__contrastAuditAll()` en la pantalla real y esperar listas vacías en los cuatro temas/modos.
- Mutaciones temporales propuestas: permitir embestidas para un fallo/bloqueo, mostrar el estado final antes del impacto, reactivar un registro antiguo al montar y reducir el temporizador del motor a 1 ms. En cada caso alguna prueba debe fallar; restaurar y comprobar las pruebas correspondientes.

## 7. Cierre de la issue

- Actualizar los dos README y `docs/guia-tecnica.md` con el comportamiento final.
- Ejecutar tipos, compilación, pruebas de cliente/servidor y E2E. Hacer las comprobaciones largas secuencialmente y limitar workers para evitar la sobrecarga observada en #65.
- Usar bases propias (`rivalmon_codex_59_test` y `rivalmon_codex_59_e2e`) y eliminarlas al terminar; nunca usar las de Claude.
- Completar el PR con `Closes #59`, decisiones de implementación, resultados observados, mutaciones detectadas y cualquier comprobación que no se haya podido realizar. La CI debe validar el último commit en un clon limpio.
- Dejar la rama para la revisión independiente de Claude y la fusión de Marco. No comenzar #57 hasta que Marco lo indique y #59 esté en `main`.
