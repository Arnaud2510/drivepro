# Règles financières de DrivePro

Le moteur se trouve dans `src/lib/finance/engine.ts` : des fonctions pures, sans effet de bord, couvertes par `src/lib/finance/engine.test.ts`.

## Principes

1. **Montants entiers en unités mineures.** Les montants sont stockés en centimes pour l'EUR et en francs pour XOF, XAF et GNF, qui n'ont pas de décimales. Le nombre de décimales vient des données ICU (`Intl`) : aucune devise n'est codée en dur.
2. **Un seul arrondi par coût calculé.** L'arrondi est commercial : la moitié est arrondie en s'éloignant de zéro. Les prix unitaires de l'énergie (1,789 €/L) restent décimaux.
3. **Le réel prime toujours sur l'estimé.** Chaque estimation est marquée (`hasEstimates`, `commissionSource`, `energy.source`).
4. **Aucune double déduction.** Les commissions, le carburant, les charges fixes, les pourboires et les bonus ne sont comptés qu'une fois (voir ci-dessous).
5. **Pas de valeur quand la donnée manque.** Les ratios renvoient `null` si leur dénominateur est nul ou absent. L'interface affiche alors « Données insuffisantes » ou « Non calculable ».

## Revenus (une ligne par plateforme et par journée)

| Cas | Chiffre d'affaires retenu | Commission |
|---|---|---|
| Brut connu, commission saisie | brut + bonus/pourboires **non inclus** | réelle (`actual`) |
| Brut connu, commission vide, montant versé saisi | idem | **déduite** = CA − autres frais − versé (`derived`) |
| Brut connu, commission vide, taux configuré | idem | **estimée** = brut des courses × taux (`estimated`) |
| Brut connu, rien d'autre | idem | 0, signalée `commissionUnknown` |
| Seul le net versé est connu | montant versé | 0, déjà déduite (`included`), signalé `grossUnknown` |

Les cases « Déjà inclus dans le montant brut » des bonus et des pourboires évitent de les compter deux fois.

## Énergie

- **Mode estimé** : litres (ou kWh) = km professionnels × consommation ÷ 100, puis coût = quantité × prix unitaire. Les achats de carburant ou de recharge de la journée **ne sont pas déduits** : ils sont listés dans `ignoredEnergyExpenses`.
- **Mode réel** : coût = somme des achats de carburant ou de recharge de la journée.
- Achats faits un jour non travaillé : ils sont ignorés si le mode par défaut du profil est « estimé », et déduits s'il est « réel ».

## Kilomètres et heures

- Kilomètres = compteur fin − compteur début. Si ce calcul est impossible, on prend la distance saisie directement. On retire ensuite les km personnels. Un compteur inversé est signalé.
- Heures = fin − début − pause. Les services qui passent minuit sont gérés. Le champ « heures actives », s'il est rempli, remplace ce calcul.

## Charges fixes mensuelles

Elles ne sont jamais déduites en entier sur une seule journée. Trois méthodes sont configurables dans le profil :

| Méthode | Part par journée travaillée | Total d'une période |
|---|---|---|
| `calendar_day` (défaut) | mensuel ÷ nombre de jours du mois | prorata des jours calendaires écoulés (jusqu'à aujourd'hui) |
| `worked_day` | mensuel ÷ jours de travail prévus | somme des parts des journées travaillées |
| `separate` | 0 | prorata des jours calendaires |

## Formules (section 9 du cahier des charges)

```
Chiffre d'affaires brut   = Σ revenus des lignes (sans double comptage)
Revenus après commissions = CA − commissions − autres frais de plateforme
Coûts hors commission     = énergie + dépenses variables + quote-part de charges fixes
Bénéfice opérationnel     = CA − commissions − frais de plateforme − coûts hors commission
Bénéfice horaire          = bénéfice ÷ heures         (null si heures = 0)
Bénéfice kilométrique     = bénéfice ÷ km pro         (null si km = 0)
Marge                     = bénéfice ÷ CA × 100       (null si CA = 0)
```

Sur une période, les ratios par heure et par km ne prennent que les journées où l'heure (ou le km) est connue, pour que numérateur et dénominateur portent sur les mêmes jours.

## Projection de fin de mois

- **Rythme** : jours restants attendus = (jours travaillés ÷ jours écoulés) × jours restants du mois.
- **Jours prévus** : jours restants attendus = jours prévus − jours déjà travaillés.
- Projection = bénéfice avant charges fixes + moyenne par jour travaillé × jours restants attendus − **charges fixes du mois entier**.
- Elle est affichée avec la mention « Une projection n'est pas un revenu garanti ».

## Provision fiscale

`provision = bénéfice × taux` si le bénéfice est positif, sinon 0. Le taux est saisi par l'utilisateur et n'est jamais pré-rempli. La provision est affichée séparément du bénéfice opérationnel, avec un avertissement : elle ne remplace pas l'avis d'un comptable.

## Conversion de devises

`convert(amount, { from, to, rate, date, source })` refuse tout taux qui n'est pas daté et sourcé. L'application ne convertit jamais rien automatiquement. Changer la devise du profil ne convertit pas les montants existants, et un avertissement le signale.

## Comparateur

- **Par plateforme** : quand une journée mélange plusieurs plateformes, ses heures, ses km et ses coûts sont répartis au prorata du chiffre d'affaires de chaque ligne. Ces lignes sont marquées `prorated` et l'interface l'explique.
- Un ratio n'est affiché qu'à partir de 3 jours et 5 heures de données (`MIN_COMPARE_DAYS`, `MIN_COMPARE_HOURS`).
- Le classement se fait au **bénéfice horaire**, pas au chiffre d'affaires.

## Scénario de référence (testé)

Données : CA 150 €, commission 30 €, 200 km, 6 L/100 km, carburant à 1,70 €/L, nourriture 10 €, nettoyage 5 €, entretien 5 €, charges fixes imputées 10 €, 10 h de travail.

Résultat : 12 L de carburant, soit 20,40 € · coûts hors commission 50,40 € · coûts totaux 80,40 € · **bénéfice 69,60 €** · 6,96 €/h · 0,348 €/km · marge de 46,4 %.
