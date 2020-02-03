import sys
from random import random
from read_fcs import FCSFile
from histogram_analysis import run_experimental_analysis

if __name__ == '__main__':
	
	data = []
	
	property_name = sys.argv[1]
	
	filenames = sys.argv[2:]
	
	for filename in filenames:
		try:
			file = FCSFile()
			file.load_file(filename)
			file_data = file.get_data_by_name(property_name)
			data += file_data
			
		except:
			continue
			
	if len(data) > 5000:
		new_data = []
		for i in range(5000):
			new_data.append(data[int(random()*len(data))])
			
		data = new_data
			
	print(data)
	sys.stdout.flush()
	sys.stderr.flush()