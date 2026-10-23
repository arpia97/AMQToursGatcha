import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('acdb',Path(__file__).parents[1]/'tools/acdb.py')
acdb=importlib.util.module_from_spec(spec)
spec.loader.exec_module(acdb)

class ParserTests(unittest.TestCase):
    def test_literal_parser_handles_mysql_escaping_without_executing_sql(self):
        self.assertEqual(list(acdb.values("(1,'O\\'Brien',NULL,'a,b'),(2,'double''quote',-3,'x\\ny');")),[[1,"O'Brien",None,'a,b'],[2,"double'quote",-3,'x\ny']])
        for bad in ["(sleep(3))", "(1,'unfinished", "(1,1+2)"]:
            with self.assertRaises(ValueError): list(acdb.values(bad))

    def test_names_repair_reversible_mojibake_and_preserve_unicode(self):
        self.assertEqual(acdb.clean('ãƒ¬ãƒ\xa0'),'レム')
        self.assertEqual(acdb.clean('レム'),'レム')
        self.assertEqual(acdb.clean('  A &amp; B  '),'A & B')
        self.assertEqual(acdb.clean('François'),'François')

if __name__=='__main__': unittest.main()
