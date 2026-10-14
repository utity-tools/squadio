# Glossary

Terms used in the code, the UI and the docs. Code identifiers are in English; the Spanish term is
what consultancies in Spain usually say.

| Term                     | Spanish                  | Meaning                                                                                                 |
| ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| Organization             | Organización             | The tenant: a consultancy or a company. Owns everything else                                            |
| Category                 | Categoría                | A job grade with a cost per hour and a sell rate (Senior Developer, PM). Costs live here, not on people |
| Person                   | Persona                  | Someone on the bench. Has a category and weekly hours, never a salary                                   |
| Bench                    | Banquillo                | All people of the organization and how busy they are                                                    |
| Project                  | Proyecto                 | A piece of client work with a pricing model and a price                                                 |
| Scenario                 | Escenario                | One candidate team for a project. Projects have several; one can be chosen                              |
| Chosen scenario          | Escenario elegido        | The scenario the organization commits to. Its rates are frozen when chosen                              |
| Assignment               | Asignación               | A category (and optionally a person) on a scenario, with allocation, dates and who it reports to        |
| Open role                | Vacante                  | An assignment with no person yet                                                                        |
| Allocation               | Dedicación               | Share of a person's working week on an assignment, as a percentage                                      |
| Extra cost               | Coste extra              | Non-staff cost on a scenario: fixed, recurring (per month) or a percentage                              |
| Fixed price              | Precio cerrado           | Revenue is the agreed price; changing the team only moves cost                                          |
| Time and materials (T&M) | T&M                      | Revenue is hours × sell rate; changing the team moves cost and revenue. The price is an optional cap    |
| Fully loaded annual cost | Coste empresa            | Gross salary + employer social security + other yearly costs (equipment, training, insurance)           |
| Net annual hours         | Horas netas anuales      | Hours a person actually works in a year, after holidays, leave and training (about 1,550)               |
| Cost per hour            | Coste/hora               | Fully loaded annual cost / net annual hours                                                             |
| Sell rate                | Tarifa de venta          | What an hour of a category is billed at in T&M                                                          |
| Availability factor      | Factor de disponibilidad | Net annual hours / calendar working hours (about 0.78)                                                  |
| Nominal hours            | Horas nominales          | Calendar hours of an assignment: working days × daily hours × allocation. Used for planning             |
| Effective hours          | Horas efectivas          | Nominal hours × availability factor. Used for cost, billing and the effective rate                      |
| Overhead                 | Overhead                 | Structural cost charged as a percentage of staff cost                                                   |
| Buffer                   | Buffer                   | Contingency as a percentage of direct cost plus overhead                                                |
| Direct margin            | Margen directo           | Revenue − direct cost                                                                                   |
| Net margin               | Margen neto              | Revenue − total cost                                                                                    |
| Margin %                 | Margen %                 | Margin / revenue. Never over cost (that is markup)                                                      |
| Effective rate           | Tarifa efectiva          | Revenue / effective hours. The best way to compare scenarios with the same fixed price                  |
| Target margin            | Margen objetivo          | Net margin % the organization aims for; drives the green, amber and red status                          |
| Over-allocation          | Sobreasignación          | A person above 100% in a week across chosen scenarios and the one being edited                          |
| Health check             | Diagnóstico              | A deterministic rule that flags a structural risk in a team (v0.4)                                      |
