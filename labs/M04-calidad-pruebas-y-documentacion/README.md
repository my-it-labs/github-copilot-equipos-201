# M04 — Calidad, pruebas y documentación asistidas por IA

[← Página anterior](../M03-del-requisito-a-la-pr/08-lab-trazabilidad.md) · [Siguiente página →](00-la-red-de-tests.md)

Copilot escribe código, tests, documentación y workflows más deprisa de lo que nadie puede revisarlos línea a línea. Este módulo trata de lo que convierte esa velocidad en algo fiable: **usar Copilot para poner red de tests a Teatralia, encontrar y corregir fallos, documentar y automatizar la verificación**. Cada página toma un problema real de la plataforma (la comisión de liquidaciones, el céntimo de las devoluciones, los correos triplicados de Teatro Cierzo, la búsqueda de pedidos que filtra datos de otros promotores, un descuento que dejó de aplicarse) y lo cierra siempre de la misma forma: con una comprobación contra el sistema que no depende de lo que diga Copilot.

## Qué aprenderás

- Pedir a Copilot tests de `calcOrderAmounts` y `calcRefund` cuyos valores esperados salen de la política y no del código, y saber si sirven rompiendo el código a propósito.
- Construir datos de prueba desde pedidos reales de la base de datos y validarlos contra la política, `psql` y la API.
- Reproducir un fallo (el céntimo de `PED-2026-1250`, el asunto de 93 caracteres de `EV-CIERZO-0027`) antes de pedir la causa, y arreglar el caso y la familia.
- Refactorizar el checkout con un test de caracterización como juez, y localizar con `git bisect` el commit que rompió el descuento `OTONO10`.
- Demostrar en local una inyección SQL en el backoffice y corregirla con consultas parametrizadas.
- Generar una especificación OpenAPI, unas notas de versión y un workflow de GitHub Actions, y comprobar cada uno contra el servidor, los commits y una pull request en rojo y en verde.

## Teoría

### La pregunta de cada página: ¿contra qué se comprueba?

Lo que genera Copilot es plausible por construcción. La diferencia entre aceptarlo a ciegas y aceptarlo con criterio es tener, para cada tipo de entregable, una fuente que no sea el propio Copilot ni el código que se está cambiando:

| Lo que genera Copilot | Contra qué se comprueba | Página |
|-----------------------|-------------------------|--------|
| Tests unitarios | La regla de negocio, con números calculados a mano | [01](01-lab-tests-de-la-comision.md) |
| Datos de prueba | Pedidos reales (`psql`), la política y la API | [02](02-lab-datos-de-prueba.md) |
| Un arreglo numérico | El ejemplo de la propia política (2 × 18,25 € → 32,85 €) | [03](03-lab-caso-limite-redondeo.md) |
| Una explicación de un fallo | La traza del servicio y las tablas | [04](04-lab-debugging-correo-duplicado.md) |
| Un refactor | Un snapshot del comportamiento anterior | [05](05-lab-refactor-con-red.md) |
| La explicación de un commit | `git show` del commit que señala `bisect` | [06](06-lab-regresion-con-bisect.md) |
| Una revisión de seguridad | Una explotación en local con `curl` | [07](07-lab-inyeccion-sql.md) |
| Una especificación OpenAPI | Una compra real con el comprobador del curso | [08](08-lab-readme-y-openapi.md) |
| Notas de versión | Los commits de la versión y su código | [09](09-lab-notas-de-version.md) |
| Un workflow | Verlo fallar y pasar en una pull request | [10](10-lab-workflow-de-tests.md) |

### Tipos de test que aparecen en el módulo

| Tipo | Qué compara | Ejemplo en Teatralia | Cuándo se usa |
|------|-------------|----------------------|---------------|
| Unitario de regla | Una función con el valor que pide el negocio | `calcOrderAmounts` con 2 × 35,50 € → 532 de comisión | Proteger una regla |
| Con datos de escenario (*fixtures*) | Una función con casos sacados de pedidos reales | `PED-2026-1100`: devolución parcial de 28,80 € | Cubrir los casos raros del negocio |
| De caracterización (*snapshot*) | La salida de hoy con la de ayer | 300 carritos de `calcOrderAmounts` | Refactorizar código heredado |
| De integración | La API real contra la base de datos | Búsqueda de pedidos con `app.inject` | Seguridad y consultas SQL |

> [!NOTE]
> Un test en verde no dice que el código esté bien: dice que hace lo que el test comprueba. Si el valor esperado se calculó leyendo el código, el test aprueba también sus errores. Por eso todas las páginas escriben el valor esperado desde fuera del código.

### Reproducir antes de explicar

Con un fallo delante, Copilot propone causas en segundos. Sin evidencia, esas causas son hipótesis que suenan bien. El orden que siguen los labs de debugging, regresión y seguridad es el mismo: reproducir el fallo, capturar lo que el sistema dice de él (una traza, un test en rojo, una respuesta de `curl`) y solo entonces pedir la explicación, que se contrasta con esa evidencia.

> [!TIP]
> Todos los labs parten de `CONFIRM=1 make reset` y se pueden hacer en cualquier orden. Los de historial (06 y 09) usan un repositorio aparte que genera `scripts/m04-regresion.sh` en `/tmp/teatralia-historial`.

## Páginas

<!-- gen:paginas -->
| # | Página | Qué hay |
|---|--------|---------|
| 00 | [Demo: la red de tests](00-la-red-de-tests.md) | Un cambio sin tests, el mismo con tests generados y qué atrapa cada uno |
| 01 | [Laboratorio: tests unitarios de la comisión](01-lab-tests-de-la-comision.md) | Tests generados para el cálculo de comisión, revisados contra la regla de negocio |
| 02 | [Laboratorio: escenarios y datos de prueba](02-lab-datos-de-prueba.md) | Fixtures para pedidos límite (agotado, reembolso parcial, doble cobro) generados y validados |
| 03 | [Laboratorio: el caso límite del redondeo](03-lab-caso-limite-redondeo.md) | Un reembolso que no cuadra por céntimos, reproducido con un test y corregido |
| 04 | [Laboratorio: debugging del correo duplicado](04-lab-debugging-correo-duplicado.md) | Clientes que reciben dos confirmaciones; hipótesis, logs y causa con ayuda de Copilot |
| 05 | [Laboratorio: refactorizar con red de tests](05-lab-refactor-con-red.md) | Partir una función larga del checkout sin cambiar su comportamiento, con los tests como juez |
| 06 | [Laboratorio: encontrar una regresión con git bisect](06-lab-regresion-con-bisect.md) | Un descuento que dejó de aplicarse; bisect localiza el commit y Copilot explica el cambio |
| 07 | [Laboratorio: revisión de seguridad](07-lab-inyeccion-sql.md) | Una búsqueda del backoffice vulnerable a inyección SQL, explotada en local y corregida |
| 08 | [Laboratorio: README y OpenAPI](08-lab-readme-y-openapi.md) | Documentar la API de pedidos a partir del código y comprobar la especificación contra el servidor |
| 09 | [Laboratorio: notas de versión](09-lab-notas-de-version.md) | Notas de versión para el promotor a partir de los commits de una release |
| 10 | [Laboratorio: workflow de tests en GitHub Actions](10-lab-workflow-de-tests.md) | Un workflow que ejecuta los tests en cada pull request, generado, corregido y visto fallar |

→ Empieza por **[00 — Demo: la red de tests](00-la-red-de-tests.md)**.
<!-- /gen:paginas -->

## Conclusiones del módulo

### Qué se ha visto

Copilot acelera cada pieza del trabajo de calidad (tests, datos, depuración, refactor, revisión de seguridad, documentación, integración continua), pero en todas ellas ha producido algún resultado verosímil y equivocado: un test que aprueba el redondeo sobre el total, un arreglo que devuelve un céntimo de más, un ejemplo de inyección que no escapa del promotor, campos de API que no existen. Lo que lo ha detectado siempre ha sido una comprobación externa.

### Lo que se lleva al equipo

| Práctica | Dónde se vio |
|----------|--------------|
| Dar la regla en el prompt y exigir números con su cuenta | 01, 02, 03 |
| Romper el código a propósito para validar los tests | 00, 01, 05 |
| Reproducir y capturar la evidencia antes de preguntar la causa | 04, 06, 07 |
| Arreglar el caso y la familia (idempotencia, parámetros) | 04, 07 |
| Comprobar documentos generados contra el sistema o el historial | 08, 09 |
| Automatizar la red en cada pull request y verla fallar | 10 |

### En una frase

> 🔑 Copilot genera; la calidad la pone la comprobación contra algo que no es Copilot: la regla, los datos, la traza, el historial o el servidor.
