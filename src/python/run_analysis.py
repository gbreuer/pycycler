import sys
from read_fcs import FCSFile
from histogram_analysis import run_experimental_nofig_analysis

if __name__ == '__main__':
	
	data = []
	
	property_name = sys.argv[1]
	
	g1_guess = float(sys.argv[2])
	g2_guess = float(sys.argv[3])
	low_lim = float(sys.argv[4])
	high_lim = float(sys.argv[5])
	
	filenames = sys.argv[6:]
	
	for filename in filenames:
		try:
			file = FCSFile()
			
			file.load_file(filename)
			file_data = file.get_data_by_name(sys.argv[1])
			print(filename)
			print(run_experimental_nofig_analysis(file_data, low_lim, high_lim, g1_guess, g2_guess))
			
		except:
			continue
			
	sys.stdout.flush()
	sys.stderr.flush()