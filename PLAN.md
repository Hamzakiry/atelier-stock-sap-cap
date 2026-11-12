# Atelier Stock — Plan actuel

Application étudiante SAP CAP Node.js / CDS / OData V4 / SQLite.

## Réalisé et testé
- Catalogue et création des produits.
- Lots, réception et fournisseur facultatif.
- Entrées/sorties, historique et transactions.
- Refus des quantités invalides, stocks insuffisants et sorties périmées.
- SQLite persistant, sauvegarde avant migration fournisseurs.
- Stock physique, disponible, périmé, sans date et alertes 7/30/90 jours.
- Treize tests automatisés de scénarios, dont un scénario HTTP d’authentification et d’autorisations.
- Interface web organisée en vues avec navigation par URL : accueil, produits, réceptions, mouvements, péremptions, fournisseurs et plan.

- FEFO : proposition et confirmation, lots périmés exclus, lots sans date en dernier.
- Identifiant de confirmation persistant pour éviter une répétition de la même sortie.

- Recherche catalogue par nom/référence, sans distinction de casse ni d’accents.
- Modification des produits sans modification du stock.
- Modification du nom des fournisseurs sans changer leur ID ni leurs associations.

- Inventaire : quantité comptée, motif obligatoire, mouvement d’écart, protection contre un stock obsolète et rollback testés.
- Inventaire : refus sans écart confirmé dans le navigateur par l’utilisateur ; autres scénarios couverts automatiquement.

- Autorisations CAP locales : Viewer consulte, Manager exécute les actions de modification.
- Authentification mocked limitée au développement ; comptes fictifs uniquement.
- Interface de connexion et parcours Viewer/Manager vérifiés.

- Tableau de bord graphique : barres par produit, unités kg/pièces séparées, stock physique/disponible, répartition des alertes.
- Navigation latérale et filtres du stock ; affichage ordinateur/mobile et rôles vérifiés dans un navigateur automatisé.
- Périmètre confirmé : gestion de stock uniquement, sans suivi commercial achats/ventes.

## Prochaines étapes
1. Préparer un scénario de démonstration complet avec données fictives.
2. Préparer un scénario de démonstration et valider les parcours restants dans le navigateur.
3. Étudier un cas IA utile au stock, uniquement après stabilisation du fonctionnement local.
4. Préparer une authentification de production avant tout déploiement ; Fiori elements et BTP en option.

## Limites actuelles
- Aucun ticket de vente ni calcul de chiffre d’affaires.
- Aucune IA intégrée.
- Les identifiants viewer/manager sont publics et fictifs ; l’authentification mocked ne convient pas à la production.
- Les lots sans date restent inclus dans le disponible, avec indication séparée.
- Les dates de péremption sont comparées en UTC ; le jour de péremption est inclus.
- Modification du nom, du prix de vente et du seuil des produits disponible ; référence et unité fixes.
- Les annulations de mouvements restent à développer.
- Modification du nom des fournisseurs ajoutée ; son parcours visuel reste à valider.
- Les corrections d’inventaire utilisent un mouvement IN/OUT identifié par une note Inventaire ; leur auteur CAP est enregistré. Les modifications de nom, prix et seuil des produits et de nom des fournisseurs sont tracées dans le journal du catalogue.

## Vérifier
Lancer npm test, puis npm run dev. Ouvrir http://localhost:4004/.

## Traçabilité des mouvements
- Auteur issu de req.user.id pour réception, entrée/sortie, correction et confirmation FEFO.
- Identité non acceptée dans les paramètres des actions : falsification refusée par CAP.
- Anciens mouvements conservés avec auteur non renseigné.
- Migration avec sauvegarde SQLite et comparaison des données avant/après ; aucun réimport CSV.
- Migration relançable : npm run db:migrate-authors.
- Colonne « Enregistré par » ajoutée à l’historique ; affichage visuel de cette nouvelle colonne à valider.

## Sauvegarde et restauration
- Commandes db:backup et db:restore, sauvegardes privées dans backups/.
- Contrôle d’intégrité et de compatibilité de schéma, sauvegarde de secours avant restauration.
- Restauration transactionnelle des données, y compris auteurs et déduplication FEFO.
- Test isolé : WAL, restauration complète, secours, fichiers refusés et verrou concurrent.
- README remplacé par le guide réel de l’application et les procédures de maintenance.

## Première base réelle Kiry
- 52 produits et 5 clients importés depuis l’application de facturation, source inchangée.
- Clients en lecture seule, UUID CAP distincts des identifiants source.
- Unités Pc/Kg normalisées ; prix HT et TVA conservés.
- Aucun lot, mouvement ou stock inventé ; anciennes données de démonstration conservées.
- Export réel privé, exclu de Git ; tests uniquement avec données fictives.
- Import répétable sans doublons et sans écraser les modifications locales.

## Journal du catalogue
- Valeurs avant/après, référence, champ, date et auteur CAP pour les modifications des produits et fournisseurs.
- Journal en lecture seule réservé au Manager, accès Viewer refusé côté serveur.
- Même transaction CAP que la modification : rollback des deux écritures testé.
- Pas de journalisation des enregistrements sans changement ; formats décimaux normalisés.
- Créations, imports et anciennes modifications exclus de ce journal ; aucune reconstitution.

## Interface client bilingue
- Boutons Français / العربية, préférence locale et disposition RTL en arabe.
- Traduction locale des textes d’interface, sans service externe ni modification des données CAP.
- Données métier et saisies conservées ; aide simplifiée sur les quantités et la péremption.
- Parcours navigateur vérifié en français et arabe, sur ordinateur et mobile.

## Simplification pour le magasin
- Accueil à quatre actions, libellés courts FR/AR et recherche produit par nom/référence.
- Options secondaires et graphiques repliables ; sorties en deux étapes.
- Saisie manuelle conservée dans une option avancée ; aucune règle CAP modifiée.
- Parcours réception/sortie/comptage testé sur une base isolée, avec accès Viewer et mobile.
