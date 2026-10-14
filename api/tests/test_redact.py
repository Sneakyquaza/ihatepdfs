"""Detection rules for redaction presets. Run: docker compose run --rm -v ./api/tests:/srv/tests api python -m unittest discover -s tests"""

import unittest

from app.redact import find_matches


def found(text: str, preset: str) -> list[str]:
    return [text[s:e] for s, e in find_matches(text, [preset], [])]


class Phones(unittest.TestCase):
    def test_detected(self):
        for text, expected in [
            ("Tél. : 01 6 1 38 0 5 75", "01 6 1 38 0 5 75"),  # irregular spacing (user report)
            ("Tel 6 1 2 3 4 5 6 7 8", "6 1 2 3 4 5 6 7 8"),  # irregular, no 0, but labelled
            ("appelez le 06 12 34 56 78 svp", "06 12 34 56 78"),
            ("+33 6 12 34 56 78", "+33 6 12 34 56 78"),
            ("+33 (0)6 12 34 56 78", "+33 (0)6 12 34 56 78"),
            ("0033 6 12 34 56 78", "0033 6 12 34 56 78"),
            ("06.12.34.56.78", "06.12.34.56.78"),
            ("06-12-34-56-78", "06-12-34-56-78"),
            ("0612345678", "0612345678"),
            ("Portable: 7 8 9 1 2 3 4 5 6", "7 8 9 1 2 3 4 5 6"),
        ]:
            with self.subTest(text=text):
                self.assertEqual(found(text, "phones"), [expected])

    def test_not_detected(self):
        for text in [
            "Article 1 2 3 4 5 6 7 8 9 10",  # irregular, no prefix, no label
            "Date 12/03/2024 montant 1500",
            "Réf 1234567",  # too short
            "Commande 1 5 2 8 4 3 9 9 1 livrée",
        ]:
            with self.subTest(text=text):
                self.assertEqual(found(text, "phones"), [])


class Others(unittest.TestCase):
    def test_email(self):
        self.assertEqual(found("Contact: jean.dupont+x@mail.example.fr.", "emails"), ["jean.dupont+x@mail.example.fr"])

    def test_card_requires_luhn(self):
        self.assertEqual(found("Carte 4111 1111 1111 1111", "cards"), ["4111 1111 1111 1111"])
        self.assertEqual(found("Carte 4111 1111 1111 1112", "cards"), [])

    def test_iban(self):
        self.assertEqual(found("IBAN FR76 3000 6000 0112 3456 7890 189", "iban"), ["FR76 3000 6000 0112 3456 7890 189"])

    def test_terms_case_insensitive(self):
        text = "Projet PHOENIX et phoenix"
        self.assertEqual([text[s:e] for s, e in find_matches(text, [], ["Phoenix"])], ["PHOENIX", "phoenix"])


if __name__ == "__main__":
    unittest.main()
