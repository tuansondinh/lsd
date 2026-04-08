import unittest
from multiply import multiply


class TestMultiply(unittest.TestCase):
    """Test suite for the multiply function."""

    def test_positive_integers(self):
        """Test multiplication of two positive integers."""
        self.assertEqual(multiply(3, 4), 12)
        self.assertEqual(multiply(5, 7), 35)
        self.assertEqual(multiply(1, 1), 1)

    def test_negative_integers(self):
        """Test multiplication with negative integers."""
        self.assertEqual(multiply(-3, 4), -12)
        self.assertEqual(multiply(5, -2), -10)
        self.assertEqual(multiply(-1, 8), -8)

    def test_multiplication_by_zero(self):
        """Test multiplication by zero."""
        self.assertEqual(multiply(5, 0), 0)
        self.assertEqual(multiply(0, 10), 0)
        self.assertEqual(multiply(0, 0), 0)

    def test_negative_times_negative(self):
        """Test multiplication of two negative integers."""
        self.assertEqual(multiply(-2, -3), 6)
        self.assertEqual(multiply(-5, -4), 20)
        self.assertEqual(multiply(-1, -1), 1)


if __name__ == '__main__':
    unittest.main()
