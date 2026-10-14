import type { Locale } from ".";

export interface LegalSection {
  title: string;
  body: string[]; // paragraphs; emails and https:// URLs are turned into links
}

export interface LegalDoc {
  title: string;
  updated: string;
  sections: LegalSection[];
}

const CONTACT = "sneakyquaza@gmail.com";
const REPO = "https://github.com/Sneakyquaza/ihatepdfs";
const HOST_FR = "Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Allemagne, +49 9831 505-0 (serveur loué et administré par l'éditeur).";
const HOST_EN = "Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Germany, +49 9831 505-0 (server rented and administered by the publisher).";

export const LEGAL: Record<Locale, { legal: LegalDoc; privacy: LegalDoc }> = {
  fr: {
    legal: {
      title: "Mentions légales",
      updated: "Mise à jour : 14 octobre 2026",
      sections: [
        { title: "Éditeur", body: [`Site non commercial édité par Abou-Bakr Ghenaïm (sneakyquaza). Contact : ${CONTACT}`] },
        { title: "Directeur de la publication", body: ["Abou-Bakr Ghenaïm"] },
        { title: "Hébergement", body: [HOST_FR] },
        {
          title: "Code source et licence",
          body: [
            `Le code du site est publié sous licence GNU AGPL-3.0 : ${REPO}`,
            "Composants tiers : pdf.js (Apache 2.0), pdf-lib (MIT), @imgly/background-removal (AGPL-3.0), PyMuPDF et Ghostscript (AGPL-3.0), LibreOffice (MPL 2.0), Tesseract (Apache 2.0), WeasyPrint (BSD), icônes Lucide (ISC), polices Geist et Caveat (SIL OFL 1.1).",
            "Les marques citées appartiennent à leurs propriétaires respectifs.",
          ],
        },
        {
          title: "Responsabilité",
          body: [
            "Le service est fourni gratuitement, tel quel, sans garantie de disponibilité ni de résultat. Conservez toujours une copie de vos fichiers originaux.",
            "Vous êtes responsable des fichiers que vous traitez et devez disposer des droits nécessaires sur leur contenu.",
          ],
        },
      ],
    },
    privacy: {
      title: "Confidentialité",
      updated: "Mise à jour : 14 octobre 2026",
      sections: [
        {
          title: "Vos fichiers",
          body: [
            "Outils marqués « Traité dans votre navigateur » : vos fichiers ne quittent jamais votre appareil. Rien n'est envoyé au serveur.",
            "Outils marqués « Traité sur notre serveur » : le fichier est envoyé de façon chiffrée (HTTPS), traité dans un dossier temporaire en mémoire, puis supprimé dès que le résultat vous a été renvoyé. Il n'est ni conservé, ni consulté, ni partagé, ni utilisé pour autre chose que le traitement demandé.",
          ],
        },
        {
          title: "Données collectées",
          body: [
            "Aucune donnée personnelle. Pas de compte, pas de cookie, pas de statistiques de visite, pas de publicité, aucun traceur. Les polices, scripts et modèles d'IA sont servis par ce site lui-même : aucune requête vers un service tiers.",
          ],
        },
        {
          title: "Journaux techniques",
          body: [
            "Le serveur conserve des journaux de connexion (adresse IP, date, page demandée) pendant 14 jours, pour la sécurité du service. Pour limiter les abus, l'adresse IP est aussi gardée en mémoire au plus 10 minutes afin de compter les traitements serveur. Base légale : intérêt légitime (art. 6.1.f RGPD).",
          ],
        },
        {
          title: "Stockage local",
          body: ["Vos outils favoris et récemment utilisés sont gardés dans votre navigateur (clés ihp:favorites et ihp:recent) et ne sont jamais envoyés au serveur. Vous pouvez les effacer en vidant les données du site."],
        },
        {
          title: "Vos droits",
          body: [`Accès, rectification, effacement : écrivez à ${CONTACT}. Vous pouvez aussi adresser une réclamation à la CNIL : https://www.cnil.fr`],
        },
      ],
    },
  },
  en: {
    legal: {
      title: "Legal notice",
      updated: "Last updated: October 14, 2026",
      sections: [
        { title: "Publisher", body: [`Non-commercial website published by Abou-Bakr Ghenaïm (sneakyquaza). Contact: ${CONTACT}`] },
        { title: "Publication director", body: ["Abou-Bakr Ghenaïm"] },
        { title: "Hosting", body: [HOST_EN] },
        {
          title: "Source code and licence",
          body: [
            `The site's code is released under the GNU AGPL-3.0 licence: ${REPO}`,
            "Third-party components: pdf.js (Apache 2.0), pdf-lib (MIT), @imgly/background-removal (AGPL-3.0), PyMuPDF and Ghostscript (AGPL-3.0), LibreOffice (MPL 2.0), Tesseract (Apache 2.0), WeasyPrint (BSD), Lucide icons (ISC), Geist and Caveat fonts (SIL OFL 1.1).",
            "Trademarks mentioned belong to their respective owners.",
          ],
        },
        {
          title: "Liability",
          body: [
            "The service is provided free of charge, as is, with no guarantee of availability or results. Always keep a copy of your original files.",
            "You are responsible for the files you process and must hold the necessary rights to their content.",
          ],
        },
      ],
    },
    privacy: {
      title: "Privacy",
      updated: "Last updated: October 14, 2026",
      sections: [
        {
          title: "Your files",
          body: [
            "Tools marked “Processed in your browser”: your files never leave your device. Nothing is sent to the server.",
            "Tools marked “Processed on our server”: the file is sent encrypted (HTTPS), processed in a temporary in-memory folder, then deleted as soon as the result has been sent back to you. It is never kept, viewed, shared or used for anything other than the requested processing.",
          ],
        },
        {
          title: "Data collected",
          body: [
            "No personal data. No account, no cookie, no analytics, no ads, no trackers. Fonts, scripts and AI models are served by this site itself: no request to any third-party service.",
          ],
        },
        {
          title: "Technical logs",
          body: [
            "The server keeps connection logs (IP address, date, page requested) for 14 days, for service security. To prevent abuse, the IP address is also held in memory for at most 10 minutes to count server-side jobs. Legal basis: legitimate interest (Art. 6(1)(f) GDPR).",
          ],
        },
        {
          title: "Local storage",
          body: ["Your favorite and recently used tools are kept in your browser (keys ihp:favorites and ihp:recent) and are never sent to the server. You can erase them by clearing the site's data."],
        },
        {
          title: "Your rights",
          body: [`Access, rectification, erasure: write to ${CONTACT}. You may also lodge a complaint with the CNIL (https://www.cnil.fr) or your local data protection authority.`],
        },
      ],
    },
  },
};
