import sys
from read_fcs import FCSFile

if __name__ == '__main__':
	file = FCSFile()
	try:
		file.load_file(sys.argv[1])
		print("0")
		print(sys.argv[1])
		print(file.get_params())
	except:
		print("1")
		print(sys.argv[1])
		
	sys.stdout.flush()
	sys.stderr.flush()