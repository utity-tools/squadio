# Glossary

Terms used in the code, the UI and the docs. Code identifiers are in English; the Spanish term is
what consultancies in Spain usually say.

| Term                     | Spanish                           | Meaning                                                                                                                         |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Organization             | Organización                      | The tenant: a consultancy or a company. Owns everything else                                                                    |
| Category                 | Categoría                         | A job grade (Senior Developer, PM). Its cost per hour and sell rate live in its rate, never on people                           |
| Person                   | Persona                           | Someone on the bench. Has a category and weekly hours, never a salary                                                           |
| Bench                    | Banquillo                         | All people of the organization and how busy they are                                                                            |
| Project                  | Proyecto                          | A piece of client work with a pricing model. Its price is restricted                                                            |
| Scenario                 | Escenario                         | One candidate team for a project. Projects have several; one can be chosen                                                      |
| Chosen scenario          | Escenario elegido                 | The scenario the organization commits to. Its rates and cost settings are frozen when chosen (frozen rates, frozen cost config) |
| Assignment               | Asignación                        | A category (and optionally a person) on a scenario, with allocation, dates and who it reports to                                |
| Open role                | Vacante                           | An assignment with no person yet                                                                                                |
| Change                   | Cambio                            | One edit to a scenario (add, move or remove an assignment). Undo and redo move a cursor over its changes                        |
| Allocation               | Dedicación                        | Share of a person's working week on an assignment, as an integer percentage from 0 to 100                                       |
| Extra cost               | Coste extra                       | Non-staff cost on a scenario: fixed, recurring (per month) or a percentage                                                      |
| Fixed price              | Precio cerrado                    | Revenue is the agreed price; changing the team only moves cost                                                                  |
| Time and materials (T&M) | T&M                               | Revenue is hours × sell rate; changing the team moves cost and revenue. The price is an optional cap                            |
| Fully loaded annual cost | Coste empresa                     | Gross salary + employer social security + other yearly costs (equipment, training, insurance)                                   |
| Net annual hours         | Horas netas anuales               | Hours a person actually works in a year, after holidays, leave and training (about 1,550)                                       |
| Cost per hour            | Coste/hora                        | Fully loaded annual cost / net annual hours                                                                                     |
| Sell rate                | Tarifa de venta                   | What an hour of a category is billed at in T&M                                                                                  |
| Availability factor      | Factor de disponibilidad          | Net annual hours / calendar working hours (about 0.78)                                                                          |
| Nominal hours            | Horas nominales                   | Calendar hours of an assignment: working days × daily hours × allocation. Used for planning                                     |
| Effective hours          | Horas efectivas                   | Nominal hours × availability factor. Used for cost, billing and the effective rate                                              |
| Overhead                 | Overhead                          | Structural cost charged as a percentage of staff cost                                                                           |
| Buffer                   | Buffer                            | Contingency as a percentage of direct cost plus overhead                                                                        |
| Direct margin            | Margen directo                    | Revenue − direct cost                                                                                                           |
| Net margin               | Margen neto                       | Revenue − total cost                                                                                                            |
| Margin %                 | Margen %                          | Margin / revenue. Never over cost (that is markup)                                                                              |
| Effective rate           | Tarifa efectiva                   | Revenue / effective hours. The best way to compare scenarios with the same fixed price                                          |
| Target margin            | Margen objetivo                   | Net margin % the organization aims for; drives the green, amber and red status                                                  |
| Over-allocation          | Sobreasignación                   | A person above 100% in a week across chosen scenarios and the one being edited                                                  |
| Health check             | Diagnóstico                       | A deterministic rule that flags a structural risk in a team (v0.4)                                                              |
| Rate access              | Acceso a tarifas                  | Permission to see rates, costs and margins, enforced by the database (ADR 0005). Without it, projects and teams only            |
| Tenant context           | Contexto de organización          | The organization a database transaction acts for (`app.organization_id`). Without it, no rows                                   |
| Restricted entity        | Entidad restringida               | An entity that holds money (rates, prices, costs). Only readable and writable with rate access                                  |
| Access context           | Contexto de acceso                | The organization and rate access a database transaction acts with (`app.organization_id`, `app.rate_access`)                    |
| Frozen rate              | Tarifa congelada                  | A category's cost (fully loaded annual cost, or a manual cost per hour) and sell rate, copied into a scenario when it is chosen |
| Frozen cost config       | Configuración de costes congelada | A scenario's overhead %, buffer % and availability factor, copied when it is chosen. Target margin is not frozen                |
| Basis point              | Punto básico                      | A hundredth of a percent (31% = 3,100). How percentages that touch money are held in code (ADR 0010)                            |
