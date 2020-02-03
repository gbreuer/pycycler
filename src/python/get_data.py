import sys
from random import random
from read_fcs import FCSFile
from histogram_analysis import run_experimental_analysis

if __name__ == '__main__':

	property_name = sys.argv[1]

	filename = sys.argv[2]

	file = FCSFile()
	file.load_file(filename)
	file_data = file.get_data_by_name(property_name)

	print(file_data)
	sys.stdout.flush()
	sys.stderr.flush()
