# python read_fcs.py
# import modules for reading fcs files

#Version 2.0

import struct
import numpy as np
import codecs

class BitReader:
    def __init__(self, f):
        self.input = f
        self.accumulator = 0
        self.bcount = 0
        self.read = 0

    def readbit(self):
        if self.bcount == 0 :
            a = self.input.read(1)
            if ( len(a) > 0 ):
                self.accumulator = ord(a)
            self.bcount = 8
            self.read = len(a)
        rv = ( self.accumulator & ( 1 << (self.bcount-1) ) ) >> (self.bcount-1)
        self.bcount -= 1
        return rv

    def readbits(self, n):
        v = 0
        while n > 0:
            v = (v << 1) | self.readbit()
            n -= 1
        return v


class Parameter:
	def __init__(self,PnR,PnE,PnN,PnB):
		rem = PnR
		self.range_mask = 1
		while rem > 1:
			self.range_mask *= 2
			rem = rem/2
		self.range = PnR
		self.range_mask -= 1
		self.name = PnN

		self.bits = int(PnB)
		self.scale = PnE
		self.data = [ ]

		if self.scale[0] != 0:
			print("***WARNING: Nonlinear scales in testing.***")

	def addData(self,data_point):
		#if self.scale[0] != 0:
		#	if self.scale[1] == 0:
		#		print "***WARNING: Invalid scale for " + self.name + "! Assuming " + str(self.scale[0]) + ",1.0***"
		#		self.scale[1] = 1
		#	data_point = np.power(10,(self.scale[0]*data_point/self.range))*self.scale[1]
		self.data.append(data_point)

	def getData(self):
		return self.data

def read_parameters(file_name):
	f = open(file_name,'r')

	header_dict = { }
	parameter_names = [ ]
	l = f.readline()
	f.close()
	#TODO: Figure out difference between FCS2.0 and FCS3.0
	cols = l.split('|')
	if len(cols) < 3:
		cols = l.split('\\')

	for x in cols:
		try:
			if x[0] == '$':
				header_dict[x[1:]] = cols[cols.index(x)+1]
		except:
			print('Skipping parameter: %s'%x)

	#Identify parameters
	for x in range(int(header_dict['PAR'])):
		if 'P'+str(x+1)+'S' in header_dict:
			parameter_names.append(header_dict['P'+str(x+1)+'S'])
		else:
			parameter_names.append(header_dict['P'+str(x+1)+'N'])

	return parameter_names


class FCSFile:
    def __init__(self):
        self.header_dict = { }
        self.parameters = [ ]

    def read_file(self,filename):
    	with open(filename,'r',errors='ignore') as open_file:
    		l = open_file.readline()

    		#TODO: Figure out difference between FCS2.0 and FCS3.0 & when to pick one split over the others
    		cols = l.split('|')
    		cols2 = l.split('\\')
    		if len(cols2) > len(cols):
    			cols = cols2
    		#if len(cols) < 3:
    		#	cols = l.split('\\')
    		#	start_data = cols[0].split()[3]
    		#	self.header_dict['BEGINDATA'] = start_data
    		#
    		#Parse header segment
    		#TODO: Finish all of these
    		#print cols
    		header = cols[0]

    		if 'FCS3' not in header[0:6]:
    			raise Exception('Only files of type FCS3 currently supported.')

    		self.header_dict['BEGINDATA'] = int(header[26:34])

    		for x in cols:
    			try:
    				if x[0] == '$':
    					self.header_dict[x[1:]] = cols[cols.index(x)+1]
    			except:
    				print('skipping header type: %s'%x)

    		#Identify parameters
    		for x in range(int(self.header_dict['PAR'])):
    			self.parameters.append(Parameter(int(self.header_dict['P'+str(x+1)+'R']),[float(y) for y in self.header_dict['P'+str(x+1)+'E'].split(',')],\
    			self.header_dict['P'+str(x+1)+'N'],int(self.header_dict['P'+str(x+1)+'B'])))
    			if 'P'+str(x+1)+'S' in self.header_dict:
    				self.parameters[-1].name = self.header_dict['P'+str(x+1)+'S']

    	with open(filename,'rb') as open_file:
    		if self.header_dict['BYTEORD'] == '4,3,2,1': #bigendian
    			endian = '>'
    		else:
    			endian = '<'

    		if self.header_dict['DATATYPE'] == 'F' and self.header_dict['MODE'] == 'L':
    			#throwaway header bits
    			open_file.seek(0)
    			br = BitReader(open_file)
    			br.readbits(int(self.header_dict['BEGINDATA'])*8)
    			for x in range(int(self.header_dict['TOT'])):
    				for p in self.parameters:
    					bits = ''
    					bits = bin(br.readbits(32))[2:].zfill(32)
    					chars = bytes([int(bits[0:8],2),int(bits[8:16],2),int(bits[16:24],2),int(bits[24:],2)])

    					#TODO: currently float only
    					data = struct.unpack(endian+'f', chars)[0]
    					p.addData(data)

    		elif self.header_dict['DATATYPE'] == 'I' and self.header_dict['MODE'] == 'L':
    			#throwaway header bits
    			open_file.seek(0)
    			br = BitReader(open_file)
    			br.readbits(int(self.header_dict['BEGINDATA'])*8)
    			for x in range(int(self.header_dict['TOT'])):
    				for p in self.parameters:
    					bits = ''
    					bits = bin(br.readbits(p.bits)&p.range_mask)[2:].zfill(32)
    					chars = bytes([int(bits[0:8],2),int(bits[8:16],2),int(bits[16:24],2),int(bits[24:],2)])

    					#TODO: currently float only
    					data = struct.unpack(endian+'I',chars)[0]
    					p.addData(data)

    	if len(self.parameters) == 0:
    		raise RuntimeError("No data loaded from file. Please check the format of your FCS file and try again.")


    def load_file(self,file_name):
    	self.read_file(file_name)

    def write_file(self,output_filename):
    	op = open(output_filename,'w')
    	for p in self.parameters:
    		op.write(p.name+',')
    	op.write('\n')

    	for i in range(int(self.header_dict['TOT'])):
    		for p in range(len(self.parameters)):
    			op.write(str(self.parameters[p].data[i])+',')

    		op.write('\n')
    	op.close()

    def get_params(self):
    	names = [ ]
    	for p in self.parameters:
    		names.append(p.name)
    	return names

    def get_data_by_num(self, param_number):
    	return self.parameters[param_number].getData()

    def get_data_by_name(self, param_name):
    	for x in range(len(self.parameters)):
    		if param_name == self.parameters[x].name:
    			return self.parameters[x].getData()
