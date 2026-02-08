class ApiException(Exception):
    """Exception raised when the CIX API returns an error response.

    Attributes:
        errors: List of error message strings from the API.
    """

    def __init__(self, errors):
        if isinstance(errors, list):
            self.errors = errors
        else:
            self.errors = [errors]
        super().__init__(", ".join(self.errors))


class BracketMismatchError(Exception):
    """Raised when bracket team names don't match CIX game config.

    This blocks all further CIX API calls until the bracket is fixed.
    """
    pass
