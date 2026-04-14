import copy
class BaseContext:
    def __copy__(self):
        duplicate = object.__new__(self.__class__)
        duplicate.__dict__ = self.__dict__.copy()
        duplicate.dicts = []
        return duplicate

b = BaseContext()
b.other = 1
b2 = copy.copy(b)
print(b2.other)

