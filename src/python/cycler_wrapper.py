import sys
from read_fcs import FCSFile
from histogram_analysis import run_experimental_nofig_analysis
import json
import pandas as pd

def load_all_files(options):
	stdout = []
	data = []

	property_name = options[2]

	filenames = options[3:]

	data_dict = {}

	for filename in filenames:
		if (filename[-3:] == 'fcs'):
			file = FCSFile()

			file.load_file(filename)
			file_data = file.get_data_by_name(property_name)

		elif (filename[-3:] == 'csv'):
			df = pd.read_csv(filename)
			file_data = list(df[property_name])

		data_dict[filename] = file_data

	#return dict and average dict
	print(json.dumps(data_dict))
	sys.stdout.flush()
	sys.stderr.flush()

def check_file(filename):
	stdout = []

	try:
		if (filename[-3:] == 'fcs'):
			file = FCSFile()
			file.load_file(filename)
			stdout.append(0)
			stdout.append(filename)
			stdout.append(file.get_params())

		elif (options[2][-3:] == 'csv'):
			df = pd.read_csv(filename)
			stdout.append(0)
			stdout.append(filename)
			stdout.append(list(df.columns))

	except:
		stdout.append(1)
		stdout.append(filename)

	print(json.dumps(stdout))
	sys.stdout.flush()
	sys.stderr.flush()

def get_data(options):
	stdout = []
	property_name = options[2]

	filename = options[3]

	if (filename[-3:] == 'fcs'):
		file = FCSFile()
		file.load_file(filename)
		file_data = file.get_data_by_name(property_name)

	elif (filename[-3:] == 'csv'):
		df = pd.read_csv(filename)
		file_data = list(df[property_name])

	stdout = file_data

	print(json.dumps(stdout))
	sys.stdout.flush()
	sys.stderr.flush()

def get_preview(options):
	stdout = []
	data = []

	property_name = options[2]

	filenames = options[3:]

	for filename in filenames:
		if (filename[-3:] == 'fcs'):
			file = FCSFile()

			file.load_file(filename)
			file_data = file.get_data_by_name(property_name)

		elif (filename[-3:] == 'csv'):
			df = pd.read_csv(filename)
			file_data = list(df[property_name])

		data += file_data

	if len(data) > 5000:
		new_data = []
		for i in range(5000):
			new_data.append(data[int(random()*len(data))])

		data = new_data

	stdout += data
	print(json.dumps(stdout))
	sys.stdout.flush()
	sys.stderr.flush()

def run_analysis(options):
	stdout = []
	data = []

	property_name = options[2]

	g1_guess = float(options[3])
	g2_guess = float(options[4])
	low_lim = float(options[5])
	high_lim = float(options[6])

	filenames = options[7:]

	for filename in filenames:
		if (filename[-3:] == 'fcs'):
			file = FCSFile()

			file.load_file(filename)
			file_data = file.get_data_by_name(property_name)

		elif (filename[-3:] == 'csv'):
			df = pd.read_csv(filename)
			file_data = list(df[property_name])

		stdout.append(filename)
		stdout.append(run_experimental_nofig_analysis(file_data, low_lim, high_lim, g1_guess, g2_guess))

	print(json.dumps(stdout))
	sys.stdout.flush()
	sys.stderr.flush()

if __name__ == '__main__':
	if sys.argv[1] == 'check_file':
		check_file(sys.argv[2])

	elif sys.argv[1] == 'get_data':
		get_data(sys.argv)

	elif sys.argv[1] == 'get_preview':
		get_data(sys.argv)

	elif sys.argv[1] == 'run_analysis':
		run_analysis(sys.argv)

	elif sys.argv[1] == 'load_all_files':
		load_all_files(sys.argv)
