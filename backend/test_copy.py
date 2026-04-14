import copy
class BaseContext:
    def __copy__(self):
        duplicate = copy.copy(super())
        duplicate.dicts = []
        return duplicate

b = BaseContext()
copy.copy(b)
